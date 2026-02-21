#!/usr/bin/env node

/**
 * CLI for http-timeout-wrapper
 * Make HTTP requests with retry logic and circuit breaker from the command line
 */

import { Command } from 'commander';
import HttpWrapper from './index.js';
import fs from 'fs';

const program = new Command();

program
  .name('http-timeout-wrapper')
  .description('Make HTTP requests with retry logic and circuit breaker')
  .version('1.0.0');

// GET command
program
  .command('get <url>')
  .description('Make a GET request')
  .option('-H, --header <header>', 'Add header (format: "Name: Value")', [])
  .option('-r, --max-retries <number>', 'Maximum number of retries', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-b, --base-delay <ms>', 'Base delay for exponential backoff (ms)', '1000')
  .option('--max-delay <ms>', 'Maximum delay cap (ms)', '30000')
  .option('--no-jitter', 'Disable jitter')
  .option('--no-circuit-breaker', 'Disable circuit breaker')
  .option('--failure-threshold <number>', 'Circuit breaker failure threshold', '5')
  .option('--success-threshold <number>', 'Circuit breaker success threshold', '2')
  .option('--circuit-timeout <ms>', 'Circuit breaker half-open timeout (ms)', '60000')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-q, --quiet', 'Suppress retry messages')
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    await makeRequest('GET', url, null, options);
  });

// POST command
program
  .command('post <url>')
  .description('Make a POST request')
  .option('-d, --data <data>', 'Request body (JSON string or file path)')
  .option('-f, --file <file>', 'Read request body from file')
  .option('-H, --header <header>', 'Add header (format: "Name: Value")', [])
  .option('-r, --max-retries <number>', 'Maximum number of retries', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-b, --base-delay <ms>', 'Base delay for exponential backoff (ms)', '1000')
  .option('--max-delay <ms>', 'Maximum delay cap (ms)', '30000')
  .option('--no-jitter', 'Disable jitter')
  .option('--no-circuit-breaker', 'Disable circuit breaker')
  .option('--failure-threshold <number>', 'Circuit breaker failure threshold', '5')
  .option('--success-threshold <number>', 'Circuit breaker success threshold', '2')
  .option('--circuit-timeout <ms>', 'Circuit breaker half-open timeout (ms)', '60000')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-q, --quiet', 'Suppress retry messages')
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    await makeRequest('POST', url, options.data, options);
  });

// PUT command
program
  .command('put <url>')
  .description('Make a PUT request')
  .option('-d, --data <data>', 'Request body (JSON string or file path)')
  .option('-f, --file <file>', 'Read request body from file')
  .option('-H, --header <header>', 'Add header (format: "Name: Value")', [])
  .option('-r, --max-retries <number>', 'Maximum number of retries', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-b, --base-delay <ms>', 'Base delay for exponential backoff (ms)', '1000')
  .option('--max-delay <ms>', 'Maximum delay cap (ms)', '30000')
  .option('--no-jitter', 'Disable jitter')
  .option('--no-circuit-breaker', 'Disable circuit breaker')
  .option('--failure-threshold <number>', 'Circuit breaker failure threshold', '5')
  .option('--success-threshold <number>', 'Circuit breaker success threshold', '2')
  .option('--circuit-timeout <ms>', 'Circuit breaker half-open timeout (ms)', '60000')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-q, --quiet', 'Suppress retry messages')
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    await makeRequest('PUT', url, options.data, options);
  });

// DELETE command
program
  .command('delete <url>')
  .description('Make a DELETE request')
  .option('-H, --header <header>', 'Add header (format: "Name: Value")', [])
  .option('-r, --max-retries <number>', 'Maximum number of retries', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-b, --base-delay <ms>', 'Base delay for exponential backoff (ms)', '1000')
  .option('--max-delay <ms>', 'Maximum delay cap (ms)', '30000')
  .option('--no-jitter', 'Disable jitter')
  .option('--no-circuit-breaker', 'Disable circuit breaker')
  .option('--failure-threshold <number>', 'Circuit breaker failure threshold', '5')
  .option('--success-threshold <number>', 'Circuit breaker success threshold', '2')
  .option('--circuit-timeout <ms>', 'Circuit breaker half-open timeout (ms)', '60000')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-q, --quiet', 'Suppress retry messages')
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    await makeRequest('DELETE', url, null, options);
  });

// PATCH command
program
  .command('patch <url>')
  .description('Make a PATCH request')
  .option('-d, --data <data>', 'Request body (JSON string or file path)')
  .option('-f, --file <file>', 'Read request body from file')
  .option('-H, --header <header>', 'Add header (format: "Name: Value")', [])
  .option('-r, --max-retries <number>', 'Maximum number of retries', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '30000')
  .option('-b, --base-delay <ms>', 'Base delay for exponential backoff (ms)', '1000')
  .option('--max-delay <ms>', 'Maximum delay cap (ms)', '30000')
  .option('--no-jitter', 'Disable jitter')
  .option('--no-circuit-breaker', 'Disable circuit breaker')
  .option('--failure-threshold <number>', 'Circuit breaker failure threshold', '5')
  .option('--success-threshold <number>', 'Circuit breaker success threshold', '2')
  .option('--circuit-timeout <ms>', 'Circuit breaker half-open timeout (ms)', '60000')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-q, --quiet', 'Suppress retry messages')
  .option('-v, --verbose', 'Verbose output')
  .action(async (url, options) => {
    await makeRequest('PATCH', url, options.data, options);
  });

/**
 * Parse headers from command line
 */
function parseHeaders(headers) {
  const result = {};
  const headersArray = Array.isArray(headers) ? headers : [headers];

  headersArray.forEach(header => {
    if (header.includes(':')) {
      const [name, ...valueParts] = header.split(':');
      result[name.trim()] = valueParts.join(':').trim();
    }
  });

  return result;
}

/**
 * Load request data from string or file
 */
function loadData(data, file) {
  if (file) {
    const content = fs.readFileSync(file, 'utf-8');
    return content;
  }

  if (data) {
    return data;
  }

  return null;
}

/**
 * Parse request data
 */
function parseData(data, method) {
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    if (method === 'GET' || method === 'DELETE') {
      return data;
    }
    throw new Error(`Invalid JSON data: ${error.message}`);
  }
}

/**
 * Make HTTP request with retry logic
 */
async function makeRequest(method, url, data, options) {
  const startTime = Date.now();
  let attemptCount = 0;

  const config = {
    maxRetries: parseInt(options.maxRetries),
    timeout: parseInt(options.timeout),
    baseDelay: parseInt(options.baseDelay),
    maxDelay: parseInt(options.maxDelay),
    jitter: options.jitter !== false,
    circuitBreaker: {
      enabled: options.circuitBreaker !== false,
      failureThreshold: parseInt(options.failureThreshold),
      successThreshold: parseInt(options.successThreshold),
      timeout: parseInt(options.circuitTimeout),
      onCircuitOpen: () => {
        if (!options.quiet) {
          console.error('🔴 Circuit breaker opened');
        }
      },
      onCircuitClose: () => {
        if (!options.quiet) {
          console.error('🟢 Circuit breaker closed');
        }
      },
    },
    onRetry: (attempt, error) => {
      attemptCount++;
      if (!options.quiet) {
        console.error(`⚠️  Retry attempt ${attempt} due to: ${error.message}`);
      }
    },
  };

  // Create HTTP wrapper
  const http = new HttpWrapper(config);

  // Parse headers
  const headers = parseHeaders(options.header);

  // Load and parse data
  let body = null;
  if (data || options.file) {
    let rawData = data;
    if (options.file) {
      rawData = fs.readFileSync(options.file, 'utf-8');
    }
    body = parseData(rawData, method);
  }

  try {
    let response;

    switch (method.toUpperCase()) {
    case 'GET':
      response = await http.get(url, { headers });
      break;
    case 'POST':
      response = await http.post(url, body, { headers });
      break;
    case 'PUT':
      response = await http.put(url, body, { headers });
      break;
    case 'DELETE':
      response = await http.delete(url, { headers });
      break;
    case 'PATCH':
      response = await http.patch(url, body, { headers });
      break;
    default:
      throw new Error(`Unsupported method: ${method}`);
    }

    const duration = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Verbose output
    if (options.verbose) {
      console.error(`\n📡 ${method} ${url}`);
      console.error(`⏱️  Duration: ${duration}ms`);
      console.error(`📊 Status: ${response.status} ${response.statusText}`);
      console.error(`🏷️  Content-Type: ${contentType}`);
      if (attemptCount > 0) {
        console.error(`🔄 Retries: ${attemptCount}`);
      }

      // Circuit breaker state
      const cbState = http.getCircuitBreakerState();
      console.error(`🔌 Circuit Breaker: ${cbState.state}`);
      console.error('');
    }

    // Get response body
    let responseBody;
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
      // Pretty print JSON
      const output = JSON.stringify(responseBody, null, 2);
      if (options.output) {
        fs.writeFileSync(options.output, output);
      } else {
        console.log(output);
      }
    } else {
      responseBody = await response.text();
      if (options.output) {
        fs.writeFileSync(options.output, responseBody);
      } else {
        console.log(responseBody);
      }
    }

    process.exit(0);

  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.name === 'CircuitBreakerOpenError') {
      console.error('❌ Circuit breaker is open - service may be down');
      process.exit(1);
    }

    console.error(`❌ Request failed: ${error.message}`);
    if (options.verbose) {
      console.error(`⏱️  Duration: ${duration}ms`);
      if (attemptCount > 0) {
        console.error(`🔄 Retries: ${attemptCount}`);
      }
    }
    process.exit(1);
  }
}

// Parse command line arguments
program.parse(process.argv);
