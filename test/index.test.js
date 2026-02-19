/**
 * Tests for http-timeout-wrapper
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  HttpWrapper,
  CircuitBreaker,
  CircuitBreakerOpenError,
  calculateDelay,
  isRetryableError,
  fetchWithTimeout,
  httpFetch,
  DEFAULT_CONFIG,
} from '../src/index.js';

describe('calculateDelay', () => {
  it('should calculate exponential backoff without jitter', () => {
    assert.strictEqual(calculateDelay(0, 1000, 10000, false), 1000);
    assert.strictEqual(calculateDelay(1, 1000, 10000, false), 2000);
    assert.strictEqual(calculateDelay(2, 1000, 10000, false), 4000);
  });

  it('should cap delay at maxDelay', () => {
    assert.strictEqual(calculateDelay(10, 1000, 5000, false), 5000);
  });

  it('should add random jitter when enabled', () => {
    const delay1 = calculateDelay(2, 1000, 10000, true);
    const delay2 = calculateDelay(2, 1000, 10000, true);
    const baseDelay = 1000 * Math.pow(2, 2);

    // With jitter, delays should be <= baseDelay
    assert.ok(delay1 <= baseDelay);
    assert.ok(delay2 <= baseDelay);

    // Multiple runs should produce different values (probabilistic)
    assert.ok(delay1 !== delay2 || delay1 !== delay1);
  });

  it('should always return non-negative delay', () => {
    for (let i = 0; i < 100; i++) {
      const delay = calculateDelay(i, 1000, 30000, true);
      assert.ok(delay >= 0);
      assert.ok(delay <= 30000);
    }
  });
});

describe('isRetryableError', () => {
  it('should retry on configured status codes', () => {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];

    retryableStatuses.forEach(status => {
      const error = new Error('Test error');
      error.status = status;
      assert.ok(isRetryableError(error, retryableStatuses, []));
    });
  });

  it('should not retry on non-retryable status codes', () => {
    const error = new Error('Test error');
    error.status = 404;
    assert.ok(!isRetryableError(error, [408, 429, 500], []));
  });

  it('should retry on network errors', () => {
    const retryableErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];

    retryableErrors.forEach(code => {
      const error = new Error('Test error');
      error.code = code;
      assert.ok(isRetryableError(error, [], retryableErrors));
    });
  });

  it('should retry on timeout errors', () => {
    const error = new Error('Timeout');
    error.name = 'AbortError';
    assert.ok(isRetryableError(error, [], []));

    error.name = 'TimeoutError';
    assert.ok(isRetryableError(error, [], []));
  });

  it('should not retry on unknown errors', () => {
    const error = new Error('Unknown error');
    assert.ok(!isRetryableError(error, [], []));
  });
});

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 3, successThreshold: 2, timeout: 60000 });
    const state = cb.getState();
    assert.strictEqual(state.state, 'closed');
    assert.strictEqual(state.failureCount, 0);
  });

  it('should open after failure threshold', async () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 3, successThreshold: 2, timeout: 60000 });

    const failingFn = () => Promise.reject(new Error('Fail'));

    await assert.rejects(() => cb.execute(failingFn), { message: 'Fail' });
    await assert.rejects(() => cb.execute(failingFn), { message: 'Fail' });
    await assert.rejects(() => cb.execute(failingFn), { message: 'Fail' });

    const state = cb.getState();
    assert.strictEqual(state.state, 'open');
    assert.strictEqual(state.failureCount, 3);
  });

  it('should reject when circuit is open', async () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, successThreshold: 2, timeout: 60000 });

    // Force open
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));

    // Should reject with CircuitBreakerOpenError
    await assert.rejects(() => cb.execute(() => Promise.resolve('ok')), CircuitBreakerOpenError);
  });

  it('should close after success threshold in half-open state', async () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, successThreshold: 2, timeout: 100 });

    // Open the circuit
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Successful attempts should close circuit
    const result = await cb.execute(() => Promise.resolve('ok'));
    assert.strictEqual(result, 'ok');

    const result2 = await cb.execute(() => Promise.resolve('ok'));
    assert.strictEqual(result2, 'ok');

    const state = cb.getState();
    assert.strictEqual(state.state, 'closed');
  });

  it('should reset state when reset() is called', async () => {
    const cb = new CircuitBreaker({ enabled: true, failureThreshold: 2, successThreshold: 2, timeout: 60000 });

    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));

    cb.reset();

    const state = cb.getState();
    assert.strictEqual(state.state, 'closed');
    assert.strictEqual(state.failureCount, 0);
    assert.strictEqual(state.successCount, 0);
  });

  it('should skip circuit breaker when disabled', async () => {
    const cb = new CircuitBreaker({ enabled: false });

    // Should not track failures
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error('Fail'))));

    const state = cb.getState();
    assert.strictEqual(state.failureCount, 0);
  });
});

describe('HttpWrapper', () => {
  it('should create wrapper with default config', () => {
    const wrapper = new HttpWrapper();
    assert.strictEqual(wrapper.config.maxRetries, DEFAULT_CONFIG.maxRetries);
    assert.strictEqual(wrapper.config.timeout, DEFAULT_CONFIG.timeout);
  });

  it('should create wrapper with custom config', () => {
    const wrapper = new HttpWrapper({ maxRetries: 5, timeout: 60000 });
    assert.strictEqual(wrapper.config.maxRetries, 5);
    assert.strictEqual(wrapper.config.timeout, 60000);
  });

  it('should have convenience methods for HTTP verbs', () => {
    const wrapper = new HttpWrapper();
    assert.strictEqual(typeof wrapper.get, 'function');
    assert.strictEqual(typeof wrapper.post, 'function');
    assert.strictEqual(typeof wrapper.put, 'function');
    assert.strictEqual(typeof wrapper.delete, 'function');
    assert.strictEqual(typeof wrapper.patch, 'function');
  });

  it('should get circuit breaker state', () => {
    const wrapper = new HttpWrapper();
    const state = wrapper.getCircuitBreakerState();
    assert.ok(state.hasOwnProperty('state'));
    assert.ok(state.hasOwnProperty('failureCount'));
  });

  it('should reset circuit breaker', () => {
    const wrapper = new HttpWrapper();
    wrapper.resetCircuitBreaker();
    const state = wrapper.getCircuitBreakerState();
    assert.strictEqual(state.state, 'closed');
  });

  it('should update configuration', () => {
    const wrapper = new HttpWrapper({ maxRetries: 3 });
    wrapper.updateConfig({ maxRetries: 10, timeout: 60000 });
    assert.strictEqual(wrapper.config.maxRetries, 10);
    assert.strictEqual(wrapper.config.timeout, 60000);
  });
});

describe('httpFetch convenience function', () => {
  it('should export httpFetch function', () => {
    assert.strictEqual(typeof httpFetch, 'function');
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should export default configuration', () => {
    assert.ok(DEFAULT_CONFIG.hasOwnProperty('maxRetries'));
    assert.ok(DEFAULT_CONFIG.hasOwnProperty('timeout'));
    assert.ok(DEFAULT_CONFIG.hasOwnProperty('circuitBreaker'));
  });
});
