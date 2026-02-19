#!/usr/bin/env node

/**
 * Basic usage example for http-timeout-wrapper
 */

import HttpWrapper from '../src/index.js';

// Create HTTP wrapper with custom configuration
const http = new HttpWrapper({
  maxRetries: 3,
  timeout: 10000,
  baseDelay: 1000,
  onRetry: (attempt, error) => {
    console.log(`⚠️  Retry attempt ${attempt} due to: ${error.message}`);
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    onCircuitOpen: () => {
      console.log('🔴 Circuit breaker opened');
    },
    onCircuitClose: () => {
      console.log('🟢 Circuit breaker closed');
    },
  },
});

async function main() {
  try {
    console.log('📡 Making request to httpbin.org...');

    // GET request
    const response = await http.get('https://httpbin.org/get', {
      headers: {
        'X-Custom-Header': 'http-timeout-wrapper-demo',
      },
    });

    const data = await response.json();
    console.log('✅ Response received:');
    console.log(`   Status: ${response.status}`);
    console.log(`   URL: ${data.url}`);

    // POST request
    console.log('\n📤 Making POST request...');
    const postResponse = await http.post('https://httpbin.org/post', {
      message: 'Hello from http-timeout-wrapper!',
      timestamp: new Date().toISOString(),
    });

    const postData = await postResponse.json();
    console.log('✅ POST response received:');
    console.log(`   Status: ${postResponse.status}`);
    console.log(`   Message: ${postData.json.message}`);

    // Circuit breaker state
    console.log('\n📊 Circuit breaker state:');
    const state = http.getCircuitBreakerState();
    console.log(`   State: ${state.state}`);
    console.log(`   Failures: ${state.failureCount}`);
    console.log(`   Successes: ${state.successCount}`);

  } catch (error) {
    console.error('❌ Request failed:', error.message);
    if (error.name === 'CircuitBreakerOpenError') {
      console.error('   Circuit breaker is open - service may be down');
    }
  }
}

main().catch(console.error);
