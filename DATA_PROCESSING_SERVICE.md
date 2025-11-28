# Data Processing Microservice

A microservice for processing and transforming information that can connect with other services.

## Overview

The Data Processing Microservice provides REST API endpoints for transforming and processing data in various ways. It supports operations like uppercase/lowercase transformations, filtering, mapping, and aggregation.

## API Endpoints

### Health Check
- **GET** `/rest/data-processing/health`
- Returns the health status of the microservice
- Response:
  ```json
  {
    "status": "healthy",
    "service": "data-processing",
    "timestamp": "2025-11-12T05:19:19.721Z"
  }
  ```

### Get Available Operations
- **GET** `/rest/data-processing/operations`
- Returns a list of all available operations with descriptions and examples
- Response:
  ```json
  {
    "status": "success",
    "operations": [...]
  }
  ```

### Process Data
- **POST** `/rest/data-processing/process`
- Processes and transforms data based on the specified operation
- Request Body:
  ```json
  {
    "operation": "uppercase|lowercase|filter|map|aggregate",
    "data": "any",
    "options": {}
  }
  ```
- Response:
  ```json
  {
    "status": "success",
    "result": "transformed data"
  }
  ```

### Process Multiple Sources
- **POST** `/rest/data-processing/process-multiple`
- Combines and processes data from multiple sources
- Request Body:
  ```json
  {
    "sources": [
      { "name": "source1", "data": {...} },
      { "name": "source2", "data": {...} }
    ]
  }
  ```

## Operations

### Uppercase
Transforms string data to uppercase. Works with strings, arrays, and objects.

**Example:**
```json
{
  "operation": "uppercase",
  "data": "hello world"
}
```
**Result:** `"HELLO WORLD"`

### Lowercase
Transforms string data to lowercase. Works with strings, arrays, and objects.

**Example:**
```json
{
  "operation": "lowercase",
  "data": "HELLO WORLD"
}
```
**Result:** `"hello world"`

### Filter
Filters array data based on conditions.

**Example:**
```json
{
  "operation": "filter",
  "data": [
    { "name": "John", "age": 30 },
    { "name": "Jane", "age": 25 }
  ],
  "options": {
    "conditions": { "age": 30 }
  }
}
```
**Result:** `[{ "name": "John", "age": 30 }]`

### Map
Maps array data to specific fields.

**Example:**
```json
{
  "operation": "map",
  "data": [
    { "name": "John", "age": 30, "city": "NYC" }
  ],
  "options": {
    "fields": ["name", "age"]
  }
}
```
**Result:** `[{ "name": "John", "age": 30 }]`

### Aggregate
Aggregates array data with optional grouping.

**Example:**
```json
{
  "operation": "aggregate",
  "data": [
    { "category": "A", "value": 10 },
    { "category": "A", "value": 20 },
    { "category": "B", "value": 15 }
  ],
  "options": {
    "groupBy": "category",
    "sumFields": ["value"]
  }
}
```
**Result:**
```json
[
  { "category": "A", "value": 30 },
  { "category": "B", "value": 15 }
]
```

## Architecture

The microservice is composed of two main modules:

1. **lib/dataProcessing.ts** - Core processing logic
   - Data transformation functions
   - Validation logic
   - Processing algorithms

2. **routes/dataProcessing.ts** - REST API handlers
   - Express route handlers
   - Request validation
   - Response formatting

## Integration

The microservice is integrated into the OWASP Juice Shop application through the main server.ts file. The routes are registered under the `/rest/data-processing` path.

## Testing

Tests are located in:
- `test/api/dataProcessingSpec.ts` - API integration tests
- `test/server/dataProcessingSpec.ts` - Unit tests

Run tests with:
```bash
npm test
```

## Usage Examples

### Using curl

```bash
# Health check
curl http://localhost:3000/rest/data-processing/health

# Transform to uppercase
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{"operation": "uppercase", "data": "hello world"}'

# Filter data
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "filter",
    "data": [{"name": "John", "age": 30}, {"name": "Jane", "age": 25}],
    "options": {"conditions": {"age": 30}}
  }'
```

### Using JavaScript/TypeScript

```typescript
// Example using fetch
const response = await fetch('http://localhost:3000/rest/data-processing/process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    operation: 'uppercase',
    data: 'hello world'
  })
});

const result = await response.json();
console.log(result.result); // "HELLO WORLD"
```

## Error Handling

The microservice returns appropriate HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid input)
- `500` - Internal server error

Error responses follow this format:
```json
{
  "status": "error",
  "error": "Error message"
}
```

## Future Enhancements

Possible future enhancements include:
- Additional transformation operations
- Batch processing capabilities
- Data validation operations
- Format conversion (JSON to XML, CSV, etc.)
- Scheduled processing jobs
- Webhook support for async processing
