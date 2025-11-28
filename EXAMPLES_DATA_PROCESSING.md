# Data Processing Microservice - Usage Examples

This document provides practical examples of using the Data Processing Microservice.

## Quick Start

The microservice is accessible at `/rest/data-processing` with the following endpoints:

### 1. Health Check
Check if the service is running:

```bash
curl http://localhost:3000/rest/data-processing/health
```

Response:
```json
{
  "status": "healthy",
  "service": "data-processing",
  "timestamp": "2025-11-12T05:19:19.721Z"
}
```

### 2. List Available Operations
Get information about all available operations:

```bash
curl http://localhost:3000/rest/data-processing/operations
```

## Use Case Examples

### Example 1: Product Name Normalization
Convert all product names to uppercase for consistency:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "uppercase",
    "data": ["apple juice", "orange juice", "banana smoothie"]
  }'
```

Response:
```json
{
  "status": "success",
  "result": ["APPLE JUICE", "ORANGE JUICE", "BANANA SMOOTHIE"]
}
```

### Example 2: Filter Products by Category
Filter products to show only items in a specific category:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "filter",
    "data": [
      {"name": "Apple Juice", "category": "beverages", "price": 1.99},
      {"name": "T-Shirt", "category": "clothing", "price": 19.99},
      {"name": "Orange Juice", "category": "beverages", "price": 2.49}
    ],
    "options": {
      "conditions": {"category": "beverages"}
    }
  }'
```

Response:
```json
{
  "status": "success",
  "result": [
    {"name": "Apple Juice", "category": "beverages", "price": 1.99},
    {"name": "Orange Juice", "category": "beverages", "price": 2.49}
  ]
}
```

### Example 3: Create Product Summary
Extract only specific fields from product data:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "map",
    "data": [
      {"id": 1, "name": "Apple Juice", "price": 1.99, "stock": 100, "supplier": "ABC Corp"},
      {"id": 2, "name": "Orange Juice", "price": 2.49, "stock": 75, "supplier": "XYZ Ltd"}
    ],
    "options": {
      "fields": ["name", "price"]
    }
  }'
```

Response:
```json
{
  "status": "success",
  "result": [
    {"name": "Apple Juice", "price": 1.99},
    {"name": "Orange Juice", "price": 2.49}
  ]
}
```

### Example 4: Sales Report by Category
Aggregate sales data by product category:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "aggregate",
    "data": [
      {"category": "beverages", "sales": 150, "revenue": 299.50},
      {"category": "beverages", "sales": 200, "revenue": 498.00},
      {"category": "clothing", "sales": 50, "revenue": 999.50},
      {"category": "clothing", "sales": 30, "revenue": 599.70}
    ],
    "options": {
      "groupBy": "category",
      "sumFields": ["sales", "revenue"]
    }
  }'
```

Response:
```json
{
  "status": "success",
  "result": [
    {"category": "beverages", "sales": 350, "revenue": 797.50},
    {"category": "clothing", "sales": 80, "revenue": 1599.20}
  ]
}
```

### Example 5: Total Sales Calculation
Calculate totals without grouping:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "aggregate",
    "data": [
      {"sales": 150, "revenue": 299.50},
      {"sales": 200, "revenue": 498.00},
      {"sales": 50, "revenue": 999.50}
    ],
    "options": {
      "sumFields": ["sales", "revenue"]
    }
  }'
```

Response:
```json
{
  "status": "success",
  "result": {
    "sales": 400,
    "revenue": 1797.00
  }
}
```

### Example 6: Process Multiple Data Sources
Combine data from different services:

```bash
curl -X POST http://localhost:3000/rest/data-processing/process-multiple \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [
      {
        "name": "products",
        "data": [
          {"id": 1, "name": "Apple Juice"},
          {"id": 2, "name": "Orange Juice"}
        ]
      },
      {
        "name": "inventory",
        "data": [
          {"productId": 1, "stock": 100},
          {"productId": 2, "stock": 75}
        ]
      },
      {
        "name": "sales",
        "data": [
          {"productId": 1, "sold": 50},
          {"productId": 2, "sold": 30}
        ]
      }
    ]
  }'
```

Response:
```json
{
  "status": "success",
  "result": {
    "products": [
      {"id": 1, "name": "Apple Juice"},
      {"id": 2, "name": "Orange Juice"}
    ],
    "inventory": [
      {"productId": 1, "stock": 100},
      {"productId": 2, "stock": 75}
    ],
    "sales": [
      {"productId": 1, "sold": 50},
      {"productId": 2, "sold": 30}
    ]
  }
}
```

## Integration with JavaScript/TypeScript

### Example: Using Fetch API

```typescript
// Transform product names
async function normalizeProductNames(products: string[]) {
  const response = await fetch('http://localhost:3000/rest/data-processing/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operation: 'uppercase',
      data: products
    })
  });
  
  const result = await response.json();
  return result.result;
}

// Usage
const normalizedNames = await normalizeProductNames(['apple juice', 'orange juice']);
console.log(normalizedNames); // ['APPLE JUICE', 'ORANGE JUICE']
```

### Example: Filter and Map Pipeline

```typescript
async function getProductSummary(products: any[], category: string) {
  // First, filter by category
  const filterResponse = await fetch('http://localhost:3000/rest/data-processing/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'filter',
      data: products,
      options: { conditions: { category } }
    })
  });
  
  const filtered = await filterResponse.json();
  
  // Then, map to summary fields
  const mapResponse = await fetch('http://localhost:3000/rest/data-processing/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'map',
      data: filtered.result,
      options: { fields: ['name', 'price'] }
    })
  });
  
  const summary = await mapResponse.json();
  return summary.result;
}
```

## Error Handling

The microservice returns appropriate error responses:

```bash
# Invalid request (missing operation)
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

Response (400 Bad Request):
```json
{
  "status": "error",
  "error": "Invalid request format. Required fields: operation, data"
}
```

```bash
# Unknown operation
curl -X POST http://localhost:3000/rest/data-processing/process \
  -H "Content-Type: application/json" \
  -d '{"operation": "unknown", "data": "test"}'
```

Response (200 OK with error status):
```json
{
  "status": "error",
  "error": "Unknown operation: unknown"
}
```

## Best Practices

1. **Check service health**: Always verify the service is running before making requests
2. **Validate input**: Ensure your data matches the expected format for each operation
3. **Handle errors**: Always check the `status` field in responses
4. **Use appropriate operations**: Choose the right operation for your use case
5. **Chain operations**: For complex transformations, make multiple sequential calls
6. **Monitor performance**: Be mindful of data size when processing large datasets

## Security Considerations

The microservice includes built-in protection against:
- **Prototype pollution**: Automatically filters dangerous property names (`__proto__`, `constructor`, `prototype`)
- **Input validation**: Validates request structure before processing
- **Type safety**: Enforces TypeScript type checking

## Support

For more information, see the complete documentation in `DATA_PROCESSING_SERVICE.md`.
