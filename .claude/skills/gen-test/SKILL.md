---
name: gen-test
description: Generate a vitest test file following project mock patterns (Map-based Redis/S3, vi.fn() Prisma)
disable-model-invocation: true
---

# gen-test

Generate a vitest test file for a module in this monorepo.

## Arguments

- `$ARGUMENTS` — The module name or file path to generate tests for (e.g., `StepExecutor`, `packages/core/src/engine/FlowEngine.ts`)

## Instructions

1. Locate the source file for the given module. Search in `packages/core/src/` and `packages/connectors/src/` if a bare name is given.
2. Read the source file to understand its exports, dependencies, and behavior.
3. Generate a test file in `packages/core/tests/` (or the appropriate package's test directory).

## Test Conventions

Follow these project patterns exactly:

### Imports
```typescript
import { describe, it, expect, vi } from 'vitest';
// Import from source using .js extensions (ESM)
import { MyClass } from '../src/path/to/module.js';
import type { SomeType } from '../src/types/flow.js';
```

### Mock Patterns

**Redis** — mock with a `Map`:
```typescript
const mockRedis = {
  get: vi.fn((key: string) => store.get(key) ?? null),
  set: vi.fn((key: string, value: string) => { store.set(key, value); return 'OK'; }),
  del: vi.fn((key: string) => { store.delete(key); return 1; }),
  keys: vi.fn((pattern: string) => [...store.keys()].filter(k => k.startsWith(pattern.replace('*', '')))),
};
```

**S3** — mock with a `Map`:
```typescript
const mockS3 = {
  putObject: vi.fn(async (params: any) => { s3Store.set(params.Key, params.Body); }),
  getObject: vi.fn(async (params: any) => ({ Body: { transformToString: async () => s3Store.get(params.Key) } })),
};
```

**Prisma** — mock with `vi.fn()`:
```typescript
const mockPrisma = {
  flowRun: {
    create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    update: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null),
  },
};
```

### Helper Factories

Create `make*` helpers for test data:
```typescript
function makeContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: {}, receivedAt: new Date() },
    steps: {},
    variables: {},
    ...overrides,
  };
}
```

### Structure
- Group with `describe()` blocks per class/function
- Use descriptive `it()` names: `'throws when no executor is registered for a type'`
- Test happy path, error cases, and edge cases
- No test containers — all mocks are in-memory
- Use `vi.mock()` for external module mocking when needed

### File Naming
- Test file: `<ModuleName>.test.ts` in the tests directory
- Match the source module name exactly
