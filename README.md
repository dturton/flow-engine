# Flow Engine

A TypeScript iPaaS flow orchestration engine (similar to Celigo). Define multi-step integration flows as DAGs, execute them with parallel step dispatch, retry policies, and real-time monitoring via a web dashboard.

## Architecture

```
┌──────────────┐     BullMQ      ┌──────────────┐
│   API Server │ ──────────────► │    Worker     │
│  (Fastify)   │                 │  (BullMQ)     │
└──────┬───────┘                 └──────┬────────┘
       │                                │
       │ Prisma                         │ FlowEngine
       ▼                                ▼
┌──────────────┐                 ┌──────────────┐
│  PostgreSQL  │                 │ Redis + S3   │
│  (runs, flows)│                │ (context)    │
└──────────────┘                 └──────────────┘

┌──────────────┐     /api proxy
│  Web Dashboard│ ─────────────► API Server
│  (React+Vite) │
└──────────────┘
```

**Four packages** in a pnpm monorepo:

| Package | Description |
|---------|-------------|
| `@flow-engine/core` | DAG resolver, flow engine, step executors, context store, Prisma persistence |
| `@flow-engine/api` | Fastify REST API — flow CRUD, trigger, run queries, health check |
| `@flow-engine/worker` | BullMQ consumer — instantiates the engine and processes queued jobs |
| `@flow-engine/web` | React 18 + Vite + Tailwind dashboard — flow list, detail, run viewer |

### How it works

1. **Define a flow** — a list of steps with input mappings, dependencies, retry policies
2. **Trigger via API** — the API validates the DAG and enqueues a BullMQ job
3. **Worker picks it up** — resolves the DAG, executes steps in parallel (respecting dependencies)
4. **Steps run through executors** — Action (HTTP), Transform, Branch (JSONata), Script (sandboxed VM), Loop, Delay
5. **Context flows between steps** — outputs stored in Redis (large payloads offloaded to S3/MinIO)
6. **Results persisted** — run history and step-level logs saved to PostgreSQL

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- Docker & Docker Compose

### Setup

```bash
# Clone and install
git clone <repo-url> && cd flow-engine
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# Configure environment
cp .env.example .env

# Push database schema
pnpm prisma:generate
pnpm prisma:push

# Build all packages
pnpm build
```

### Run

Start the three services (in separate terminals or use a process manager):

```bash
pnpm dev:api      # Fastify on :3000
pnpm dev:worker   # BullMQ worker
pnpm dev:web      # Vite on :5173 (proxies /api to :3000)
```

Seed example flows:

```bash
pnpm seed
```

Open http://localhost:5173 to view the dashboard.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/flows` | List flows (filter: `?tenantId=`, `?tag=`) |
| `POST` | `/api/flows` | Create a flow |
| `GET` | `/api/flows/:flowId` | Get flow by ID |
| `PUT` | `/api/flows/:flowId` | Update a flow |
| `DELETE` | `/api/flows/:flowId` | Delete a flow |
| `POST` | `/api/flows/:flowId/trigger` | Trigger flow execution |
| `GET` | `/api/flows/:flowId/runs` | List runs for a flow (`?limit=`) |
| `GET` | `/api/runs/:runId` | Get run details with step-level output/logs |
| `POST` | `/api/runs/:runId/cancel` | Cancel a running/queued run |
| `GET` | `/api/health` | Health check (checks Redis connectivity) |

## Flow Definition

A flow is a list of steps forming a DAG:

```json
{
  "name": "My Integration",
  "tenantId": "tenant_1",
  "steps": [
    {
      "id": "fetch_data",
      "name": "Fetch Data",
      "type": "action",
      "connectorKey": "http",
      "operationId": "request",
      "inputMapping": {
        "url": { "type": "literal", "value": "https://api.example.com/data" },
        "method": { "type": "literal", "value": "GET" }
      },
      "dependsOn": [],
      "retryPolicy": {
        "maxAttempts": 3,
        "strategy": "exponential",
        "initialDelayMs": 1000,
        "maxDelayMs": 10000,
        "retryableErrors": ["network", "timeout", "serverError"]
      }
    },
    {
      "id": "transform",
      "name": "Transform Response",
      "type": "transform",
      "inputMapping": {
        "items": { "type": "jsonpath", "value": "$.steps.fetch_data.body.results" }
      },
      "dependsOn": ["fetch_data"]
    }
  ],
  "errorPolicy": { "onStepFailure": "halt" }
}
```

### Step Types

| Type | Description |
|------|-------------|
| `action` | Delegates to a connector (e.g., HTTP requests) |
| `transform` | Passes resolved inputs through as output |
| `branch` | Evaluates JSONata conditions to choose the next step |
| `script` | Runs JavaScript in a sandboxed Node.js `vm` (5s timeout) |
| `loop` | Iterates over a JSONPath array from context |
| `delay` | Waits a specified number of milliseconds |

### Input Mapping Expressions

| Type | Example | Description |
|------|---------|-------------|
| `literal` | `"hello"` | Static value |
| `jsonpath` | `$.steps.step1.result` | JSONPath into execution context |
| `jsonata` | `$sum(items.price)` | JSONata expression |
| `template` | `Hello {{name}}` | String interpolation |

## Infrastructure

Docker Compose provides:

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL 16 | 5432 | Flow definitions and run history |
| Redis 7 | 6379 | Step context store + BullMQ job queue |
| MinIO | 9000 (API), 9001 (console) | S3-compatible storage for large payloads |

## Testing

```bash
pnpm test                                      # All tests
cd packages/core && pnpm test                  # Core tests only
cd packages/core && npx vitest run tests/DagResolver.test.ts  # Single file
```

Tests use manual mocks (no test containers). Redis mocked with `Map`, S3 with `Map`, Prisma with `vi.fn()`.

## License

MIT
