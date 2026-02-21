/**
 * HTTP Timeout Wrapper
 * Smart HTTP requests with exponential backoff retries, jitter, and circuit breaker.
 */

import { setTimeout as sleep } from 'timers/promises';

// Default configuration
const DEFAULT_CONFIG = {
  timeout: 30000,           // Request timeout in ms
  maxRetries: 3,            // Maximum number of retries
  baseDelay: 1000,          // Base delay for exponential backoff (ms)
  maxDelay: 30000,          // Maximum delay cap (ms)
  retryableStatuses: [408, 429, 500, 502, 503, 504],  // Status codes to retry
  retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,    // Open circuit after N failures
    successThreshold: 2,    // Close circuit after N successes
    timeout: 60000,         // Half-open timeout in ms
  },
  jitter: true,             // Add random jitter to delays
  onRetry: null,            // Callback: (attempt, error) => void
  onCircuitOpen: null,      // Callback: () => void
  onCircuitClose: null,     // Callback: () => void
};

/**
 * Circuit breaker state machine
 */
class CircuitBreaker {
  constructor(config) {
    this.config = config;
    this.state = 'closed';  // closed, open, half-open
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (!this.config.enabled) {
      return fn();
    }

    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === 'half-open') {
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
        this.config.onCircuitClose?.();
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.successCount = 0;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      if (this.state !== 'open') {
        this.state = 'open';
        this.config.onCircuitOpen?.();
      }
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Custom error for circuit breaker open state
 */
class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Calculate exponential backoff delay with optional jitter
 */
function calculateDelay(attempt, baseDelay, maxDelay, withJitter = true) {
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

  if (!withJitter) {
    return exponentialDelay;
  }

  // Full jitter: random value between 0 and exponential delay
  return Math.floor(Math.random() * exponentialDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error, retryableStatuses, retryableErrors) {
  // Check status code
  if (error.status && retryableStatuses.includes(error.status)) {
    return true;
  }

  // Check error code (for network errors)
  if (error.code && retryableErrors.includes(error.code)) {
    return true;
  }

  // Check for timeout
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }

  return false;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeout}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }

    throw error;
  }
}

/**
 * Main HTTP wrapper with retry and circuit breaker
 */
class HttpWrapper {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
  }

  /**
   * Execute HTTP request with retry logic and circuit breaker
   */
  async request(url, options = {}) {
    const effectiveConfig = { ...this.config, ...options };
    const { maxRetries, baseDelay, maxDelay, jitter, timeout, onRetry } = effectiveConfig;

    return this.circuitBreaker.execute(async () => {
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetchWithTimeout(url, options, timeout);
          return response;
        } catch (error) {
          lastError = error;

          // Don't retry on last attempt
          if (attempt === maxRetries) {
            break;
          }

          // Check if error is retryable
          if (!isRetryableError(error, effectiveConfig.retryableStatuses, effectiveConfig.retryableErrors)) {
            break;
          }

          // Calculate delay and wait
          const delay = calculateDelay(attempt, baseDelay, maxDelay, jitter);
          onRetry?.(attempt + 1, error);
          await sleep(delay);
        }
      }

      throw lastError;
    });
  }

  /**
   * GET request
   */
  get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  post(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  /**
   * PUT request
   */
  put(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  /**
   * DELETE request
   */
  delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  patch(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    if (config.circuitBreaker) {
      this.circuitBreaker.config = { ...this.circuitBreaker.config, ...config.circuitBreaker };
    }
  }
}

/**
 * Convenience function for one-off requests
 */
async function httpFetch(url, options = {}) {
  const wrapper = new HttpWrapper(options);
  return wrapper.request(url, options);
}

// Named exports
export {
  HttpWrapper,
  CircuitBreaker,
  CircuitBreakerOpenError,
  calculateDelay,
  isRetryableError,
  fetchWithTimeout,
  httpFetch,
  DEFAULT_CONFIG,
};

// Default export
export default HttpWrapper;
