# @nzyme/openapi

A simple, type-safe OpenAPI fetch client for TypeScript projects.

## Features

- 🎯 **Type-safe**: Full TypeScript support with generated OpenAPI types
- 🚀 **Simple**: Function-based approach without complex middleware
- 🔧 **Flexible**: Support for custom fetch implementations and configurations
- 📝 **Well-tested**: Comprehensive test coverage

## Installation

```bash
yarn add @nzyme/openapi
```

## Usage

### Generate TypeScript types from OpenAPI schema

First, generate TypeScript types from your OpenAPI schema using `openapi-typescript`:

```bash
npx openapi-typescript https://api.example.com/openapi.json -o ./src/api-schema.d.ts
```

### Basic usage

```typescript
import { openApiFetch } from '@nzyme/openapi';
import type { paths } from './api-schema';

// Simple GET request with path parameters
const result = await openApiFetch<{ paths: paths }, '/pet/{petId}', 'GET'>({
    method: 'GET',
    path: '/pet/{petId}',
    baseUrl: 'https://api.example.com',
    pathParams: { petId: 123 }, // Required when path has parameters
});

// Response is a discriminated union by status code and content type
if (result.status === 200) {
    console.log('Pet data:', result.data); // Typed as Pet
    console.log('Content type:', result.contentType); // e.g., 'application/json'
} else if (result.status === 404) {
    console.error('Pet not found:', result.data); // Typed as error response
} else {
    console.error('Unexpected status:', result.status);
}
```

### POST request with body

```typescript
const { data, error } = await openApiFetch<{ paths: paths }, '/pet', 'POST'>({
    method: 'POST',
    path: '/pet',
    baseUrl: 'https://api.example.com',
    body: {
        name: 'Fluffy',
        photoUrls: ['https://example.com/photo.jpg'],
        status: 'available',
    },
    contentType: 'application/json', // Optional, defaults to first available
});
```

### Query parameters

```typescript
const { data, error } = await openApiFetch<{ paths: paths }, '/pet/findByStatus', 'GET'>({
    method: 'GET',
    path: '/pet/findByStatus',
    baseUrl: 'https://api.example.com',
    query: { status: 'available' },
});
```

### Using with configuration

For better reusability, create a configured client:

```typescript
import { createOpenApiFetch } from '@nzyme/openapi';
import type { paths } from './api-schema';

const apiClient = createOpenApiFetch<paths>({
    baseUrl: 'https://api.example.com',
    headers: {
        Authorization: 'Bearer your-token',
    },
});

// Now use the client
const { data, error } = await apiClient({
    method: 'GET',
    path: '/pet/{petId}',
    pathParams: { petId: 123 },
});
```

### Custom headers

```typescript
const { data, error } = await openApiFetch<{ paths: paths }, '/pet/{petId}', 'DELETE'>({
    method: 'DELETE',
    path: '/pet/{petId}',
    baseUrl: 'https://api.example.com',
    pathParams: { petId: 123 },
    headers: {
        api_key: 'your-api-key', // OpenAPI header parameters
        'X-Custom-Header': 'custom-value', // Additional headers
    },
});
```

### Different content types

```typescript
// JSON request (default)
const { data, error } = await openApiFetch<{ paths: paths }, '/pet', 'POST'>({
    method: 'POST',
    path: '/pet',
    baseUrl: 'https://api.example.com',
    contentType: 'application/json',
    body: { name: 'Pet', photoUrls: [], status: 'available' },
});

// XML request
const { data, error } = await openApiFetch<{ paths: paths }, '/pet', 'POST'>({
    method: 'POST',
    path: '/pet',
    baseUrl: 'https://api.example.com',
    contentType: 'application/xml',
    body: '<pet><name>Pet</name></pet>', // Body type changes based on contentType
});

// Form data request
const { data, error } = await openApiFetch<{ paths: paths }, '/pet', 'POST'>({
    method: 'POST',
    path: '/pet',
    baseUrl: 'https://api.example.com',
    contentType: 'application/x-www-form-urlencoded',
    body: { name: 'Pet', photoUrls: [], status: 'available' },
});
```

### File uploads

```typescript
const formData = new FormData();
formData.append('file', file);

const { data, error } = await openApiFetch<{ paths: paths }, '/pet/{petId}/uploadImage', 'POST'>({
    method: 'POST',
    path: '/pet/{petId}/uploadImage',
    baseUrl: 'https://api.example.com',
    pathParams: { petId: 123 },
    body: formData,
});
```

## API Reference

### `openApiFetch<Paths, Path, Method>(options)`

Simple function for making OpenAPI requests.

### `createOpenApiFetch<Paths>(config)`

Creates a configured client with default settings.

#### Configuration options

- `baseUrl`: Base URL for all requests
- `headers`: Default headers to include in all requests
- `fetch`: Custom fetch implementation (useful for testing)

#### Request options

- `method`: HTTP method
- `path`: API endpoint path
- `baseUrl`: Override base URL for this request
- `pathParams`: Path parameters (required if path contains `{param}`)
- `query`: Query parameters
- `body`: Request body (JSON, FormData, string, etc.) - required if operation requires it
- `contentType`: Content type for request body (typed from OpenAPI schema)
- `headers`: OpenAPI header parameters + additional headers (typed)
- `fetchOptions`: Additional fetch options (signal, cache, etc.)

#### Response format

The response is a discriminated union by **status code and content type**, providing perfect type safety:

```typescript
// Each possible (status, contentType) combination has its own response type
{
  status: 200;                    // Literal status code
  contentType: 'application/json'; // Literal content type
  data: Pet;                      // Typed response data for this status + content type
  response: Response;             // Original Response object
} | {
  status: 200;
  contentType: 'text/event-stream';
  data: undefined;                // Stream responses don't consume the body - use response.body
  response: Response;
} | {
  status: 404;
  contentType: 'application/json';
  data: ErrorResponse;            // Different type for error responses
  response: Response;
} | {
  status: 422;
  contentType: 'application/json';
  data: ValidationError;
  response: Response;
}
```

This allows for perfect type narrowing based on status and content type:

```typescript
const result = await apiClient({ method: 'GET', path: '/pet/{id}', pathParams: { id: 1 } });

if (result.status === 200 && result.contentType === 'application/json') {
    // result.data is typed as Pet
    console.log(result.data.name);
} else if (result.status === 200 && result.contentType === 'text/event-stream') {
    // result.data is undefined - use the stream directly
    const reader = result.response.body?.getReader();
    // ... process stream
} else if (result.status === 404) {
    // result.data is typed as NotFoundError
    console.log(result.data.message);
}
```

## License

MIT
