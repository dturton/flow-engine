# Flow Engine — Claude Code Implementation Prompt

## Context

You are building the **Flow Engine** module for an iPaaS (Integration Platform as a Service)
platform written in TypeScript — conceptually similar to Celigo. This is a monorepo project.
The Flow Engine lives at `packages/core` and is the central orchestration module.

---

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **State / Caching**: Redis (via `ioredis`)
- **Persistence**: PostgreSQL (via `prisma`)
- **Large payload offload**: S3 (via `@aws-sdk/client-s3`)
- **Queue**: BullMQ (wraps Redis)
- **Test framework**: Vitest
- **Package manager**: pnpm (monorepo workspaces)

---

## What to Build

Implement `packages/core` in full. The module must export a working `FlowEngine` class and all
supporting types, classes, and utilities described below.

---

## Directory Structure to Create

```
packages/core/
  src/
    types/
      flow.ts          # FlowDefinition, StepDefinition, and related config types
      run.ts           # FlowRun, StepRun, runtime state types
    engine/
      DagResolver.ts
      ContextStore.ts
      StepExecutor.ts  # StepExecutor interface + StepExecutorRegistry + InputResolver
      RetryManager.ts
      FlowEngine.ts
    executors/
      ActionExecutor.ts
      TransformExecutor.ts
      BranchExecutor.ts
      ScriptExecutor.ts
    persistence/
      FlowRunRepository.ts
    index.ts           # barrel export
  prisma/
    schema.prisma
  tests/
    DagResolver.test.ts
    FlowEngine.test.ts
    RetryManager.test.ts
    ContextStore.test.ts
  package.json
  tsconfig.json
```

---

## Type Definitions

### `src/types/flow.ts`

```typescript
type StepType = 'action' | 'transform' | 'branch' | 'loop' | 'delay' | 'script'

interface MappingExpression {
  type: 'jsonpath' | 'jsonata' | 'literal' | 'template'
  value: string
}

interface RetryPolicy {
  maxAttempts: number
  strategy: 'fixed' | 'exponential' | 'jitter'
  initialDelayMs: number
  maxDelayMs: number
  retryableErrors: Array<'network' | 'rateLimit' | 'timeout' | 'serverError'>
}

interface BranchCase {
  when: string            // JSONata boolean expression evaluated against FlowContext
  nextStepId: string
}

interface StepDefinition {
  id: string              // unique within flow, e.g. "fetch_orders"
  name: string
  type: StepType
  connectorKey?: string   // e.g. 'netsuite', 'hubspot'
  operationId?: string    // e.g. 'createSalesOrder'
  inputMapping: Record<string, MappingExpression | string>
  outputMapping?: Record<string, string>
  dependsOn: string[]     // step IDs that must complete before this runs
  retryPolicy?: RetryPolicy
  timeoutMs?: number
  continueOnError?: boolean
  branches?: BranchCase[] // only for type === 'branch'
  loopOver?: string       // JSONPath to array for type === 'loop'
}

interface FlowErrorPolicy {
  onStepFailure: 'halt' | 'continue' | 'goto'
  errorStepId?: string    // step to jump to on failure when policy is 'goto'
}

interface FlowDefinition {
  id: string
  version: number
  name: string
  description?: string
  tenantId: string
  steps: StepDefinition[]
  errorPolicy: FlowErrorPolicy
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}
```

### `src/types/run.ts`

```typescript
type FlowRunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying'

interface TriggerPayload {
  type: 'webhook' | 'schedule' | 'manual' | 'event'
  data: Record<string, unknown>
  receivedAt: Date
}

interface StepError {
  code: string
  message: string
  category: 'network' | 'rateLimit' | 'timeout' | 'serverError' | 'validation' | 'unknown'
  retryable: boolean
  raw?: unknown
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: Date
  meta?: Record<string, unknown>
}

interface StepOutput {
  data: Record<string, unknown>
  completedAt: Date
  durationMs: number
}

interface StepRun {
  stepId: string
  status: StepRunStatus
  attempt: number
  startedAt?: Date
  completedAt?: Date
  durationMs?: number
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: StepError
  logs: LogEntry[]
}

interface FlowRun {
  id: string
  flowId: string
  flowVersion: number
  tenantId: string
  status: FlowRunStatus
  trigger: TriggerPayload
  startedAt: Date
  completedAt?: Date
  stepRuns: Record<string, StepRun>     // keyed by stepId
  error?: { stepId: string; error: StepError; at: Date }
}

interface FlowContext {
  runId: string
  flowId: string
  trigger: TriggerPayload
  steps: Record<string, StepOutput>    // accumulated outputs from completed steps
  variables: Record<string, unknown>   // mutable flow-level variables (set by script steps)
}
```

---

## Class Specifications

### `DagResolver`

Responsibilities:
- Parse a `FlowDefinition` into an `ExecutionGraph`
- Validate for: missing `dependsOn` references, duplicate step IDs, cycles
- Compute topological depth and a valid sorted execution order

```typescript
interface ExecutionNode {
  stepId: string
  depth: number
  dependencies: Set<string>
  dependents: Set<string>
}

interface ExecutionGraph {
  nodes: Map<string, ExecutionNode>
  roots: string[]           // steps with no dependencies
  sortedOrder: string[]     // topological order
}

interface ValidationIssue {
  stepId?: string
  severity: 'error' | 'warning'
  message: string
}

class DagResolver {
  resolve(flow: FlowDefinition): ExecutionGraph
  validate(flow: FlowDefinition): ValidationIssue[]
  private buildAdjacency(steps: StepDefinition[]): Map<string, Set<string>>
  private topologicalSort(nodes: Map<string, ExecutionNode>): string[]
  private detectCycles(adj: Map<string, Set<string>>): string[][]
}
```

Throw a `FlowValidationError` (custom error class) if `validate()` returns any issues with
`severity === 'error'` when called from `resolve()`.

---

### `ContextStore`

Responsibilities:
- Store and retrieve `FlowContext` for a running flow using Redis
- Payloads larger than 64KB must be offloaded to S3; store a pointer in Redis instead
- Key format: `flow-ctx:{runId}`
- TTL: 24 hours (configurable via constructor)

```typescript
class ContextStore {
  constructor(private redis: Redis, private s3: S3Client, private bucket: string, private ttlSeconds?: number)

  async init(runId: string, trigger: TriggerPayload, flowId: string): Promise<FlowContext>
  async get(runId: string): Promise<FlowContext>
  async commitStepOutput(runId: string, stepId: string, output: StepOutput): Promise<void>
  async setVariable(runId: string, key: string, value: unknown): Promise<void>
  async release(runId: string): Promise<void>  // delete from Redis + S3

  private async isLargePayload(value: unknown): Promise<boolean>  // > 64KB check
  private async offloadToS3(runId: string, key: string, value: unknown): Promise<string>  // returns S3 key
  private async fetchFromS3(s3Key: string): Promise<unknown>
}
```

Use a `{ __s3ref: string }` sentinel object as the Redis value when a payload has been offloaded.

---

### `StepExecutor` interface + `InputResolver` + `StepExecutorRegistry`

```typescript
interface StepExecutionInput {
  step: StepDefinition
  resolvedInputs: Record<string, unknown>
  context: FlowContext
  attempt: number
}

interface StepExecutionResult {
  output: Record<string, unknown>
  logs: LogEntry[]
  durationMs: number
}

interface StepExecutor {
  readonly type: StepType
  execute(input: StepExecutionInput): Promise<StepExecutionResult>
  validate?(step: StepDefinition): ValidationIssue[]
}

class StepExecutorRegistry {
  register(executor: StepExecutor): void
  get(type: StepType): StepExecutor
  execute(type: StepType, input: StepExecutionInput): Promise<StepExecutionResult>
}

class InputResolver {
  resolve(
    mapping: StepDefinition['inputMapping'],
    context: FlowContext
  ): Record<string, unknown>

  private evaluateExpression(expr: MappingExpression, context: FlowContext): unknown
}
```

`InputResolver` must support all four expression types:
- `jsonata`: evaluate using the `jsonata` npm package against `{ trigger, steps, variables }`
- `jsonpath`: extract using `jsonpath-plus` from the same context object
- `literal`: return `expr.value` as-is
- `template`: Handlebars-style `{{steps.fetch_orders.data.id}}` string interpolation (implement
  without a library — simple regex replace is fine)

---

### `RetryManager`

```typescript
class RetryManager {
  shouldRetry(error: StepError, policy: RetryPolicy, attempt: number): boolean
  getDelayMs(policy: RetryPolicy, attempt: number): number
  // 'fixed': always initialDelayMs
  // 'exponential': min(initialDelayMs * 2^attempt, maxDelayMs)
  // 'jitter': exponential + random(0..30%) noise, capped at maxDelayMs
}
```

---

### `FlowRunRepository`

Persists every `FlowRun` state transition to Postgres using Prisma.

```typescript
class FlowRunRepository {
  async create(run: FlowRun): Promise<void>
  async updateStatus(runId: string, status: FlowRunStatus, completedAt?: Date): Promise<void>
  async upsertStepRun(runId: string, stepRun: StepRun): Promise<void>
  async findById(runId: string): Promise<FlowRun | null>
  async findByFlowId(flowId: string, limit?: number): Promise<FlowRun[]>
}
```

Prisma schema should model `FlowRun` and `StepRun` as separate tables with a foreign key.
Store `input`, `output`, `error`, `logs` as `Json` columns.

---

### `FlowEngine` — the main orchestrator

```typescript
interface FlowEngineOptions {
  maxConcurrentSteps: number    // default: 5
  defaultRetryPolicy: RetryPolicy
  stepTimeoutMs: number         // default: 30_000
}

class FlowEngine {
  constructor(
    private dagResolver: DagResolver,
    private executorRegistry: StepExecutorRegistry,
    private contextStore: ContextStore,
    private inputResolver: InputResolver,
    private retryManager: RetryManager,
    private runRepository: FlowRunRepository,
    private options: FlowEngineOptions
  )

  async execute(flow: FlowDefinition, trigger: TriggerPayload): Promise<FlowRun>
  async resume(runId: string, flow: FlowDefinition, fromStepId?: string): Promise<FlowRun>
  async cancel(runId: string): Promise<void>

  private async runLoop(run: FlowRun, flow: FlowDefinition, graph: ExecutionGraph): Promise<void>
  private getReadySteps(run: FlowRun, graph: ExecutionGraph): StepDefinition[]
  private async executeStep(run: FlowRun, step: StepDefinition, context: FlowContext): Promise<StepRun>
  private async handleStepFailure(run: FlowRun, flow: FlowDefinition, stepRun: StepRun): Promise<void>
}
```

#### `runLoop` behaviour

1. Call `getReadySteps` — returns all steps whose `dependsOn` set is a strict subset of
   completed step IDs in `run.stepRuns`
2. Dispatch up to `options.maxConcurrentSteps` ready steps in parallel using `Promise.allSettled`
3. After each batch, re-evaluate readiness — new steps may have become unblocked
4. Continue until no ready steps remain OR run reaches a terminal state
5. After the loop, set final `FlowRun.status` to `'completed'` or `'failed'`

#### `executeStep` behaviour

1. Resolve inputs via `InputResolver`
2. Call `executorRegistry.execute(step.type, { step, resolvedInputs, context, attempt })`
3. Apply `step.timeoutMs` using `Promise.race` with a timeout rejection
4. On success: call `contextStore.commitStepOutput`, persist via `runRepository.upsertStepRun`
5. On error: call `retryManager.shouldRetry` — if true, wait `retryManager.getDelayMs` then
   re-enter at step 1 (NOT re-queued, just a direct recursive call with incremented attempt)
6. On permanent failure: call `handleStepFailure`

#### `handleStepFailure` behaviour

- `halt`: mark run as `failed`, set `run.error`, emit log
- `continue`: mark step as `failed` but allow `runLoop` to keep going with remaining steps
- `goto`: mark step as `failed`, find the error-handling step in the graph, queue it next

---

## Executor Implementations

### `ActionExecutor`

Stub implementation for now — it should look up a connector by `step.connectorKey` from a
`ConnectorRegistry` (which you can mock with a `Map<string, { execute: Function }>`).
Call `connector.execute(step.operationId, resolvedInputs)` and return the result.
Throw a `ConnectorNotFoundError` if the connector key is not registered.

### `TransformExecutor`

Evaluates `step.inputMapping` using `InputResolver` (the resolved inputs ARE the output here).
Useful for reshaping data between steps without calling an external system.

### `BranchExecutor`

Evaluates each `BranchCase.when` expression (JSONata) against the current `FlowContext`.
Returns `{ nextStepId: string }` as the output for the first matching branch.
Throw a `BranchResolutionError` if no branch matches and there is no default.

### `ScriptExecutor`

Execute an arbitrary JS snippet supplied in `step.inputMapping.script` using Node's `vm` module
in a restricted sandbox. Expose `{ inputs, context }` as globals. Return whatever the script
assigns to `output`. Hard-limit execution time to 5 seconds.

---

## Prisma Schema

```prisma
model FlowRun {
  id          String      @id @default(cuid())
  flowId      String
  flowVersion Int
  tenantId    String
  status      String
  trigger     Json
  startedAt   DateTime
  completedAt DateTime?
  error       Json?
  stepRuns    StepRun[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([flowId])
  @@index([tenantId])
}

model StepRun {
  id          String    @id @default(cuid())
  flowRunId   String
  stepId      String
  status      String
  attempt     Int
  startedAt   DateTime?
  completedAt DateTime?
  durationMs  Int?
  input       Json
  output      Json?
  error       Json?
  logs        Json
  flowRun     FlowRun   @relation(fields: [flowRunId], references: [id])

  @@index([flowRunId])
  @@unique([flowRunId, stepId])
}
```

---

## Tests to Write

### `DagResolver.test.ts`
- Resolves a simple linear chain A → B → C correctly
- Resolves a diamond dependency (A → B, A → C, B+C → D) and identifies B and C as depth-1 siblings
- Throws `FlowValidationError` on a direct cycle (A depends on B, B depends on A)
- Throws `FlowValidationError` when `dependsOn` references a non-existent step ID
- Returns an empty graph for a flow with a single step and no dependencies

### `RetryManager.test.ts`
- Does not retry when `attempt >= policy.maxAttempts`
- Does not retry when `error.retryable === false`
- Does not retry when error category is not in `policy.retryableErrors`
- Returns `initialDelayMs` for `fixed` strategy regardless of attempt number
- Returns exponentially increasing delay for `exponential` strategy, capped at `maxDelayMs`
- Returns a value within the expected range for `jitter` strategy

### `ContextStore.test.ts`
- `init` stores a new `FlowContext` in Redis
- `commitStepOutput` merges step output into the existing context
- Large payloads (>64KB) are stored in S3 with a `__s3ref` pointer in Redis
- `release` deletes the Redis key and any associated S3 objects
- `get` reconstructs the full context including S3-offloaded values

### `FlowEngine.test.ts`
- Executes a 3-step linear flow and returns a completed `FlowRun`
- Executes a diamond flow (B and C run in parallel after A, D waits for both)
- Retries a failing step up to `maxAttempts` then marks it failed
- Applies `halt` error policy: stops the run when a step permanently fails
- Applies `continue` error policy: marks step failed but continues remaining steps
- `cancel` transitions run status to `cancelled` and prevents new steps from starting
- Step timeout causes the step to fail with `category: 'timeout'`

---

## Dependencies to Install

```json
{
  "dependencies": {
    "ioredis": "^5.3.2",
    "@aws-sdk/client-s3": "^3.600.0",
    "bullmq": "^5.8.0",
    "@prisma/client": "^5.14.0",
    "jsonata": "^2.0.5",
    "jsonpath-plus": "^9.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "prisma": "^5.14.0",
    "vitest": "^1.6.0",
    "typescript": "^5.4.5",
    "@types/node": "^20.14.0",
    "@types/uuid": "^10.0.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Custom Error Classes

Create `src/errors.ts` with these typed error classes:

```typescript
class FlowEngineError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'FlowEngineError'
  }
}

class FlowValidationError extends FlowEngineError {}   // code: 'FLOW_VALIDATION_ERROR'
class ConnectorNotFoundError extends FlowEngineError {} // code: 'CONNECTOR_NOT_FOUND'
class StepTimeoutError extends FlowEngineError {}       // code: 'STEP_TIMEOUT'
class BranchResolutionError extends FlowEngineError {}  // code: 'BRANCH_RESOLUTION_FAILED'
class ContextStoreError extends FlowEngineError {}      // code: 'CONTEXT_STORE_ERROR'
```

---

## Barrel Export — `src/index.ts`

Export everything a downstream package needs:

```typescript
export { FlowEngine } from './engine/FlowEngine'
export { DagResolver } from './engine/DagResolver'
export { ContextStore } from './engine/ContextStore'
export { StepExecutorRegistry, InputResolver } from './engine/StepExecutor'
export { RetryManager } from './engine/RetryManager'
export { FlowRunRepository } from './persistence/FlowRunRepository'
export * from './types/flow'
export * from './types/run'
export * from './errors'
```

---

## Implementation Notes

- All async operations must be properly awaited — no floating promises
- Use `crypto.randomUUID()` (Node built-in) for generating run IDs — no external dependency
- `runLoop` should use `Promise.allSettled` for parallel step dispatch so one failure doesn't
  abort sibling steps that are executing concurrently
- The retry loop in `executeStep` re-enters at input resolution, not re-queuing — this means
  re-calling `inputResolver.resolve()` before each attempt (important if credentials were
  refreshed by the time a retry fires)
- `ContextStore.release()` should be called in a `finally` block in `FlowEngine.execute()` to
  guarantee cleanup even on unexpected errors
- Log every state transition (queued → running → completed/failed) at `info` level with
  `{ runId, stepId, attempt, durationMs }` metadata
- For the `ScriptExecutor`, the sandbox must not have access to `require`, `process`, or `fs`
