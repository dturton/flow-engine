# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Monorepo
pnpm build                    # Build all packages (tsc + vite)
pnpm test                     # Run tests across all packages

# Core (the only package with tests currently)
cd packages/core
pnpm test                     # vitest run
pnpm test:watch               # vitest (watch mode)
npx vitest run tests/DagResolver.test.ts   # Run a single test file

# Dev servers
pnpm dev:api                  # Fastify on :3000 (tsx watch)
pnpm dev:worker               # BullMQ worker (tsx watch)
pnpm dev:web                  # Vite on :5173, proxies /api to :3000

# Prisma
pnpm prisma:generate          # Generate Prisma client from schema
pnpm prisma:push              # Push schema to database (no migration files)

# Infrastructure
docker compose up -d           # Start PostgreSQL, Redis, MinIO
cp .env.example .env           # Then edit .env if needed

# Seed data
pnpm seed                     # Create example flows via the API (requires API running)
```

## Architecture

This is a **pnpm monorepo** with five packages implementing an iPaaS flow orchestration engine (similar to Celigo):

- **`@flow-engine/core`** — The engine. Parses flow definitions into a DAG, resolves step dependencies, executes steps with retry/timeout, stores runtime context in Redis (large payloads offloaded to S3), and persists run history to PostgreSQL via Prisma.
- **`@flow-engine/api`** — Fastify REST API. Flow CRUD (persisted via Prisma), trigger endpoint that enqueues jobs to BullMQ, run query/cancel endpoints, health check.
- **`@flow-engine/connectors`** — Connector library. `BaseConnector` abstract class with operation dispatch, `AuthenticatedHttpClient`, `RateLimiter`, error classification. Ships `HttpConnector` (generic fetch) and `ShopifyConnector` (REST Admin API: products, orders, customers, inventory).
- **`@flow-engine/worker`** — BullMQ consumer. Instantiates `FlowEngine` with all dependencies and processes queued flow execution jobs.
- **`@flow-engine/web`** — React 18 + Vite + Tailwind dashboard. Flow list, create flow (JSON editor), flow detail with step table, trigger button, run history, run detail with step-level logs/output and auto-refresh.

### Core engine flow

`FlowEngine.execute()` → `DagResolver.resolve()` builds an `ExecutionGraph` → `runLoop()` dispatches ready steps via `Promise.allSettled` (up to `maxConcurrentSteps`) → each step goes through `InputResolver` → `StepExecutorRegistry` → `ContextStore.commitStepOutput()` → `FlowRunRepository.upsertStepRun()`. Retry is handled inline (recursive re-entry, not re-queued). Context is released in a `finally` block.

### Step executors

Pluggable via `StepExecutorRegistry`. Built-in: `ActionExecutor` (delegates to `ConnectorRegistry`), `TransformExecutor` (resolved inputs = output), `BranchExecutor` (JSONata conditions), `ScriptExecutor` (Node `vm` sandbox, 5s limit), `LoopExecutor` (iterates over JSONPath array), `DelayExecutor` (waits `delayMs`). Connectors live in `@flow-engine/connectors` — new connectors extend `BaseConnector` and register operation handlers (e.g., `products.list`, `orders.create`). The worker registers `HttpConnector` and conditionally `ShopifyConnector`.

### Data flow between packages

API enqueues `{ flow, trigger }` as BullMQ job data → Worker deserializes and calls `engine.execute()`. The web frontend proxies `/api/*` to the API server in dev mode. Note: `Date` fields are serialized to strings through BullMQ's JSON round-trip — the worker rehydrates them in `rehydrateDates()`.

## Module System

All packages use ES modules (`"type": "module"` in package.json). Internal imports use `.js` extensions (e.g., `import { Foo } from './bar.js'`). TypeScript is set to `strict: true` with `NodeNext` module resolution (except web which uses `bundler`).

## Testing Patterns

Tests are in `packages/core/tests/`. They use **manual mock objects** — no test containers. Redis is mocked with a `Map`, S3 with a `Map`, Prisma operations with `vi.fn()`. External modules are mocked with `vi.mock()`.

## Environment Variables

**Required**: `DATABASE_URL` (both API and worker will throw at startup if missing)

**With defaults**: `REDIS_URL` (redis://localhost:6379), `S3_BUCKET` (flow-engine), `S3_REGION` (us-east-1), `BULLMQ_QUEUE` (flow-runs), `PORT` (3000)

## Custom Errors

All custom errors extend `FlowEngineError(message, code)`. Use specific subclasses: `FlowValidationError`, `ConnectorNotFoundError`, `StepTimeoutError`, `BranchResolutionError`, `ContextStoreError`.
