---
name: new-connector
description: Scaffold a new connector extending BaseConnector with operation handlers
disable-model-invocation: true
---

# new-connector

Scaffold a new connector in `packages/connectors/`.

## Arguments

- `$ARGUMENTS` — The connector name (e.g., `stripe`, `hubspot`, `airtable`)

## Instructions

1. Create the connector directory structure at `packages/connectors/src/<name>/`
2. Generate the files listed below, following the existing ShopifyConnector pattern

## Directory Structure

```
packages/connectors/src/<name>/
├── <Name>Connector.ts       # Main connector class
├── <Name>AuthClient.ts      # Authenticated HTTP client (if needed)
├── types.ts                 # Connector-specific types
└── operations/
    └── <resource>.ts        # One file per resource (e.g., products.ts, orders.ts)
```

## Connector Class Template

Follow the `BaseConnector` pattern exactly:

```typescript
import { BaseConnector } from '../base/BaseConnector.js';
import type { HttpConnectorConfig } from '../base/types.js';

export class <Name>Connector extends BaseConnector {
  readonly id = '<name>';
  readonly name = '<Name>';

  constructor(config: HttpConnectorConfig) {
    super(config);
  }

  protected registerOperations(): void {
    // Register each operation with a handler
    // Convention: '<resource>.<verb>' e.g. 'products.list', 'orders.create'
    this.registerOperation('<resource>.list', async (inputs) => {
      // Use this.http for authenticated requests
      const response = await this.http.get('/<resource>');
      return { items: response.data };
    });
  }
}
```

## Operation Handler Template

```typescript
// operations/<resource>.ts
import type { OperationHandler } from '../../base/types.js';

export const list: OperationHandler = async (inputs, http) => {
  const response = await http.get('/<resource>', { params: inputs });
  return { items: response.data };
};

export const create: OperationHandler = async (inputs, http) => {
  const response = await http.post('/<resource>', inputs);
  return response.data;
};

export const get: OperationHandler = async (inputs, http) => {
  const { id, ...rest } = inputs;
  const response = await http.get(`/<resource>/${id}`, { params: rest });
  return response.data;
};
```

## Registration

After scaffolding, remind the user to:
1. Export the connector from `packages/connectors/src/index.ts`
2. Register it in `packages/worker/src/worker.ts` (conditionally, like ShopifyConnector)
3. Add any required env vars to `.env.example`

## Key Patterns

- Operations use the `'resource.verb'` naming convention
- `BaseConnector` provides `this.http` (AuthenticatedHttpClient) and optional `this.rateLimiter`
- All operation handlers return `Record<string, unknown>`
- Error classification is handled by the base class
- Use the `HttpConnectorConfig` type for constructor config
