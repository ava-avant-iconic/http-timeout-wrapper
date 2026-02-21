
---

## 💖 Sponsor This Project

If this library helps you build resilient HTTP requests, consider sponsoring me on GitHub:

[![Sponsor @ava-avant-iconic](https://img.shields.io/badge/Sponsor-GitHub-EA4AAA?logo=GitHub&logoColor=white)](https://github.com/sponsors/ava-avant-iconic)

Your support helps me maintain and improve this project. Every contribution counts! 🚀
# http-timeout-wrapper

Smart HTTP wrapper with exponential backoff retries, jitter, and circuit breaker pattern for resilient HTTP requests.

## Features

- ✅ **Exponential backoff retries** with configurable max attempts
- ✅ **Jitter** to avoid thundering herd problem
- ✅ **Circuit breaker pattern** to prevent cascading failures
- ✅ **Smart timeout handling** with configurable timeouts
- ✅ **Configurable retryable status codes** (408, 429, 5xx)
- ✅ **Retryable network errors** (ECONNRESET, ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
- ✅ **Convenience methods** for GET, POST, PUT, DELETE, PATCH
- ✅ **Zero dependencies** - uses native Fetch API
- ✅ **TypeScript-friendly** (exports JSDoc types)
- ✅ **Node.js 18+** support

## Installation

```bash
npm install http-timeout-wrapper
```

### CLI Installation

Install globally to use the CLI:

```bash
npm install -g http-timeout-wrapper
```

Or use directly with npx:

```bash
npx http-timeout-wrapper <command>
```

## Quick Start

```javascript
import HttpWrapper from 'http-timeout-wrapper';

const http = new HttpWrapper();

try {
  const response = await http.get('https://api.example.com/data');
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error('Request failed:', error);
}
```

## Configuration

### Default Configuration

```javascript
{
  timeout: 30000,           // Request timeout in ms
  maxRetries: 3,            // Maximum number of retries
  baseDelay: 1000,          // Base delay for exponential backoff (ms)
  maxDelay: 30000,          // Maximum delay cap (ms)
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,    // Open circuit after N failures
    successThreshold: 2,    // Close circuit after N successes
    timeout: 60000,         // Half-open timeout in ms
  },
  jitter: true,             // Add random jitter to delays
}
```

### Custom Configuration

```javascript
const http = new HttpWrapper({
  maxRetries: 5,
  timeout: 60000,
  baseDelay: 2000,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 120000,
  },
});
```

## Usage

### Basic Requests

```javascript
import HttpWrapper from 'http-timeout-wrapper';

const http = new HttpWrapper();

// GET
const response = await http.get('https://api.example.com/users');
const users = await response.json();

// POST
const created = await http.post('https://api.example.com/users', {
  name: 'John Doe',
  email: 'john@example.com',
});

// PUT
const updated = await http.put('https://api.example.com/users/1', {
  name: 'Jane Doe',
});

// PATCH
const patched = await http.patch('https://api.example.com/users/1', {
  email: 'jane@example.com',
});

// DELETE
await http.delete('https://api.example.com/users/1');
```

### Custom Options

```javascript
const response = await http.request('https://api.example.com/data', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer token123',
    'X-Custom-Header': 'value',
  },
});
```

### Retry Callbacks

```javascript
const http = new HttpWrapper({
  onRetry: (attempt, error) => {
    console.log(`Retry attempt ${attempt} due to: ${error.message}`);
  },
});
```

### Circuit Breaker Callbacks

```javascript
const http = new HttpWrapper({
  circuitBreaker: {
    enabled: true,
    onCircuitOpen: () => {
      console.log('Circuit breaker opened - service may be down');
    },
    onCircuitClose: () => {
      console.log('Circuit breaker closed - service recovered');
    },
  },
});
```

### Circuit Breaker State

```javascript
// Get current state
const state = http.getCircuitBreakerState();
console.log(state);
// {
//   state: 'closed',  // 'closed' | 'open' | 'half-open'
//   failureCount: 0,
//   successCount: 0,
//   lastFailureTime: null
// }

// Reset circuit breaker manually
http.resetCircuitBreaker();
```

### One-off Requests

```javascript
import { httpFetch } from 'http-timeout-wrapper';

const response = await httpFetch('https://api.example.com/data', {
  maxRetries: 5,
  timeout: 60000,
});
```

### Disable Circuit Breaker

```javascript
const http = new HttpWrapper({
  circuitBreaker: {
    enabled: false,
  },
});
```

## Circuit Breaker Pattern

The circuit breaker has three states:

1. **Closed** (default): Requests pass through normally. Failures increment a counter.
2. **Open**: After `failureThreshold` failures, the circuit opens. All requests fail immediately with `CircuitBreakerOpenError`.
3. **Half-open**: After `timeout` ms, one request is allowed. If successful, the circuit closes after `successThreshold` successes.

This prevents cascading failures and gives the downstream service time to recover.

## Retry Strategy

Retries follow **exponential backoff with full jitter**:

- Attempt 1: delay ≈ `baseDelay`
- Attempt 2: delay ≈ `baseDelay * 2`
- Attempt 3: delay ≈ `baseDelay * 4`
- ...

With jitter enabled (default), each delay is randomized between 0 and the calculated exponential delay. This prevents the "thundering herd" problem where many clients retry simultaneously.

## Error Handling

```javascript
import { CircuitBreakerOpenError } from 'http-timeout-wrapper';

try {
  const response = await http.get('https://api.example.com/data');
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    console.log('Service is down, circuit is open');
  } else if (error.name === 'TimeoutError') {
    console.log('Request timed out');
  } else {
    console.log('Other error:', error.message);
  }
}
```

## CLI Usage

The package includes a command-line interface for making HTTP requests with retry logic and circuit breaker.

### Installation

```bash
npm install -g http-timeout-wrapper
```

### Basic Usage

```bash
# GET request
http-timeout-wrapper get https://api.example.com/users

# POST request with JSON data
http-timeout-wrapper post https://api.example.com/users -d '{"name":"John","email":"john@example.com"}'

# PUT request
http-timeout-wrapper put https://api.example.com/users/1 -d '{"name":"Jane"}'

# DELETE request
http-timeout-wrapper delete https://api.example.com/users/1

# PATCH request
http-timeout-wrapper patch https://api.example.com/users/1 -d '{"email":"jane@example.com"}'
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-H, --header <header>` | Add header (format: "Name: Value") | - |
| `-d, --data <data>` | Request body (JSON string) | - |
| `-f, --file <file>` | Read request body from file | - |
| `-r, --max-retries <number>` | Maximum number of retries | 3 |
| `-t, --timeout <ms>` | Request timeout in ms | 30000 |
| `-b, --base-delay <ms>` | Base delay for exponential backoff (ms) | 1000 |
| `-d, --max-delay <ms>` | Maximum delay cap (ms) | 30000 |
| `--no-jitter` | Disable jitter | enabled |
| `--no-circuit-breaker` | Disable circuit breaker | enabled |
| `--failure-threshold <number>` | Circuit breaker failure threshold | 5 |
| `--success-threshold <number>` | Circuit breaker success threshold | 2 |
| `--circuit-timeout <ms>` | Circuit breaker half-open timeout (ms) | 60000 |
| `-o, --output <file>` | Output to file instead of stdout | stdout |
| `-q, --quiet` | Suppress retry messages | false |
| `-v, --verbose` | Verbose output | false |

### Examples

#### Add Headers

```bash
http-timeout-wrapper get https://api.example.com/data \
  -H "Authorization: Bearer token123" \
  -H "X-Custom-Header: value"
```

#### Custom Retry Configuration

```bash
http-timeout-wrapper get https://api.example.com/data \
  --max-retries 5 \
  --timeout 60000 \
  --base-delay 2000
```

#### Verbose Output

```bash
http-timeout-wrapper get https://api.example.com/data -v
```

Output:
```
📡 GET https://api.example.com/data
⏱️  Duration: 234ms
📊 Status: 200 OK
🏷️  Content-Type: application/json
🔌 Circuit Breaker: closed

{
  "data": { ... }
}
```

#### Quiet Mode

```bash
http-timeout-wrapper get https://api.example.com/data -q
```

Suppresses retry messages and circuit breaker notifications.

#### Save Output to File

```bash
http-timeout-wrapper get https://api.example.com/data -o response.json
```

#### Disable Circuit Breaker

```bash
http-timeout-wrapper get https://api.example.com/data --no-circuit-breaker
```

#### POST from File

```bash
# data.json
{
  "name": "John Doe",
  "email": "john@example.com"
}

# CLI command
http-timeout-wrapper post https://api.example.com/users -f data.json
```

### Custom Circuit Breaker Settings

```bash
http-timeout-wrapper get https://api.example.com/data \
  --failure-threshold 10 \
  --success-threshold 3 \
  --circuit-timeout 120000
```

### Error Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Request failed or circuit breaker open |

### CI/CD Usage

```bash
# Exit with error if request fails
http-timeout-wrapper get https://api.example.com/health || exit 1

# Use in GitHub Actions
- name: Check API health
  run: |
    npm install -g http-timeout-wrapper
    http-timeout-wrapper get https://api.example.com/health
```

## API Reference

### `HttpWrapper`

#### Constructor
```javascript
new HttpWrapper(config?)
```

#### Methods
- `request(url, options?)` - Make HTTP request with retry and circuit breaker
- `get(url, options?)` - GET request
- `post(url, data, options?)` - POST request with JSON body
- `put(url, data, options?)` - PUT request with JSON body
- `patch(url, data, options?)` - PATCH request with JSON body
- `delete(url, options?)` - DELETE request
- `getCircuitBreakerState()` - Get circuit breaker state
- `resetCircuitBreaker()` - Reset circuit breaker to closed state
- `updateConfig(config)` - Update configuration

### `httpFetch(url, options?)`

Convenience function for one-off requests. Creates a new wrapper instance for the request.

## Testing

```bash
npm test
```

## Node.js Version

Requires **Node.js 18.0.0** or higher (uses native `fetch`).

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
