# KrishiLink Logging System

## Overview

Production-grade structured logging using **Pino** - a high-performance JSON logger for Node.js.

## Quick Start

### 1. Install Dependencies

```bash
npm install pino pino-http uuid
npm install -D pino-pretty  # Development only
```

### 2. Environment Variables

Add to your `.env`:

```env
# Logging Configuration
LOG_LEVEL=info              # debug, info, warn, error, fatal
NODE_ENV=development        # development (pretty) or production (json)
SERVICE_NAME=krishilink-api # Identifies service in logs
```

### 3. Usage in Controllers

```javascript
const { logger } = require("../logging");

// In any controller
async function myController(req, res) {
  // Use request-bound logger (includes correlation ID)
  req.log.info("Starting operation");
  req.log.debug({ data: req.body }, "Request data");
  
  try {
    // ... your logic
    req.log.info("Operation successful");
  } catch (error) {
    req.log.error({ err: error }, "Operation failed");
    throw error;
  }
}
```

## Architecture

```
Request → Correlation ID Middleware → Pino-HTTP Logger → Routes
                                              ↓
                                    req.log available in controllers
                                              ↓
                                    Error Logger → Global Error Handler
                                              ↓
                                    JSON logs to stdout → Log Aggregator
```

## Features

### 1. Structured JSON Logging

**Development (pretty-printed):**
```
[2024-01-15T10:30:45Z] INFO: Starting crop creation
    cropName: "Organic Tomatoes"
    requestId: "550e8400-e29b-41d4-a716-446655440000"
```

**Production (JSON for ELK/Loki):**
```json
{
  "level": "INFO",
  "time": "2024-01-15T10:30:45.123Z",
  "service": "krishilink-api",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "firebase-uid-123",
  "msg": "Starting crop creation",
  "cropName": "Organic Tomatoes"
}
```

### 2. Request Correlation IDs

Every request gets a unique ID:
- Generated automatically or extracted from `X-Request-Id` header
- Included in all logs for that request
- Returned in response headers for debugging
- Enables distributed tracing

### 3. Automatic Error Logging

Errors are automatically logged with:
- Stack traces (dev only)
- Request context (method, URL, headers)
- User context (if authenticated)
- Error metadata (type, message, code)

### 4. Sensitive Data Redaction

Automatic redaction of:
- Passwords
- API keys
- Authorization tokens
- Session cookies
- Personal info (emails in some contexts)

## Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Detailed debugging info (query details, internal states) |
| `info` | General operational info (requests, startup, success) |
| `warn` | Warning conditions (approaching limits, suspicious activity) |
| `error` | Error conditions (failed operations, exceptions) |
| `fatal` | Critical errors requiring shutdown (OOM, panic) |

## Production Considerations

### 1. Log Aggregation (ELK Stack)

```yaml
# docker-compose.yml for local ELK
version: '3'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
  
  logstash:
    image: docker.elastic.co/logstash/logstash:8.5.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    ports:
      - "5044:5044"
  
  kibana:
    image: docker.elastic.co/kibana/kibana:8.5.0
    ports:
      - "5601:5601"
```

### 2. Docker/Container Logging

```dockerfile
# Dockerfile
# Pino logs to stdout - Docker captures automatically
CMD ["node", "src/server.js"]
```

```bash
# View logs
docker logs krishilink-api

# With filtering
docker logs krishilink-api 2>&1 | jq 'select(.level == "ERROR")'
```

### 3. Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: api
        image: krishilink-api:latest
        env:
        - name: LOG_LEVEL
          value: "info"
        - name: NODE_ENV
          value: "production"
```

### 4. CloudWatch (AWS)

```javascript
// For AWS deployments, use pino-cloudwatch transport
const pino = require('pino');

const transport = pino.transport({
  target: 'pino-cloudwatch',
  options: {
    group: '/krishilink/api',
    stream: 'production',
    awsRegion: 'us-east-1'
  }
});
```

### 5. Performance

- Pino benchmarks: ~100,000 logs/second
- Async logging - doesn't block event loop
- Minimal memory overhead
- JSON serialization in separate thread (worker_threads)

## Migration from console.log

### Before:
```javascript
console.log("User created:", userId);
console.error("Error:", err);
```

### After:
```javascript
const { logger } = require("../logging");

logger.info({ userId }, "User created");
logger.error({ err }, "User creation failed");
```

### In Controllers:
```javascript
// Use request-bound logger for correlation
req.log.info({ userId }, "User created");
```

## Troubleshooting

### No logs appearing?
- Check `LOG_LEVEL` - must be at or below the level you're logging
- Check `NODE_ENV` - development uses pino-pretty, production uses JSON

### Too many logs?
- Increase log level: `LOG_LEVEL=warn` (only warnings and errors)
- Health check endpoints are automatically filtered

### Missing correlation IDs?
- Ensure `requestLogger(app)` is called early in app.js
- Check that routes are registered after the logging middleware

### Logs too verbose in production?
- Set `LOG_LEVEL=info` (skips debug)
- Redact additional fields in `logger.js` redact configuration
- Filter out specific paths in `requestLogger.js` autoLogging.ignore

## API Reference

### logger
Main logger instance with methods: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

### createChildLogger(context)
Create a logger with additional context fields

### asyncHandler(fn)
Wrapper for async route handlers that catches errors and logs them

### req.log
Request-bound logger available in all controllers (includes requestId, userId)
