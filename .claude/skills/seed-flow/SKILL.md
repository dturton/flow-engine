---
name: seed-flow
description: Generate flow definition JSON for common integration patterns (e.g. shopify-product-sync, webhook-transform, etl-pipeline)
disable-model-invocation: true
---

# seed-flow

Generate a complete flow definition JSON for a named integration pattern, ready to paste into the flow builder or POST to the API.

## Arguments

- `$ARGUMENTS` — Pattern name and optional modifiers. Examples:
  - `shopify-product-sync` — Fetch Shopify products, transform, and output
  - `webhook-transform` — Receive webhook, transform data, send HTTP request
  - `etl-pipeline` — Extract from source, transform, load to destination
  - `branch-router` — Route data through conditional branches
  - `loop-process` — Iterate over array items and process each

## Instructions

1. Parse the pattern name from `$ARGUMENTS`
2. Generate a valid flow definition JSON matching the pattern
3. Use realistic step IDs, names, and configurations
4. Include proper `dependsOn` chains forming a valid DAG
5. Output the JSON and a brief explanation of each step

## Flow Definition Schema

```typescript
{
  name: string;
  description?: string;
  steps: Array<{
    id: string;             // e.g. "action_1_abc12"
    name: string;
    type: "action" | "transform" | "branch" | "loop" | "delay" | "script";
    dependsOn: string[];    // upstream step IDs
    connectorKey?: string;  // for action steps
    operationId?: string;   // for action steps
    connectionId?: string;  // for action steps with stored credentials
    inputMapping: Record<string, { type: "literal" | "jsonpath" | "jsonata" | "template"; value: string }>;
    loopOver?: string;      // JSONPath for loop steps
    branches?: Array<{ when: string; nextStepId: string }>;  // for branch steps
    retryPolicy?: { maxAttempts: number; strategy: "fixed" | "exponential"; initialDelayMs: number; maxDelayMs: number; retryableErrors: string[] };
    timeoutMs?: number;
    continueOnError?: boolean;
  }>;
}
```

## Pattern Templates

### shopify-product-sync
1. **action** — `shopify` / `products.list` — Fetch products
2. **loop** — `$.steps.action_1.data.data` — Iterate over products array
3. **transform** — Map product fields to target format
4. **action** — `http` / `request` — POST each transformed product

### webhook-transform
1. **transform** — Extract and reshape `$.trigger.data`
2. **script** — Custom validation/enrichment logic
3. **action** — `http` / `request` — Forward processed data

### etl-pipeline
1. **action** — Extract data from source API
2. **transform** — Clean and normalize fields
3. **branch** — Route based on data type/status
4. **action** — Load to destination API

### branch-router
1. **action** — Fetch source data
2. **branch** — Evaluate conditions with JSONata
3. **action** (branch A) — Handle case A
4. **action** (branch B) — Handle case B

### loop-process
1. **action** — Fetch list of items
2. **loop** — `$.steps.action_1.data.data` — Iterate
3. **script** — Process each item with custom logic
4. **delay** — Rate limit between batches

## Important

- Use `$.steps.<stepId>.data.data` for arrays from list operations (connector wraps in `{ data: [...] }`)
- Use `$.steps.<stepId>.data` for single-record operations
- Step IDs should follow the pattern `<type>_<n>_<random5>` (e.g. `action_1_k8m2f`)
- All JSONPath expressions must start with `$`
- JSONata conditions use dot-path without `$` prefix (e.g. `steps.action_1.data.status = "ACTIVE"`)
