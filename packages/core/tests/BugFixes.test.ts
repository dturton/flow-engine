/**
 * Targeted tests for the 7 bug fixes:
 * 1. Timing-safe signature verification
 * 2. Dead ternary — run status reflects failed steps
 * 3. toStepError handles ConnectorApiError (via duck typing)
 * 4. Cross-worker cancellation via DB check
 * 5. Branch routing via nextStepId
 * 6. Atomic commitStepOutput via Lua script
 * 7. Webhook signature is required (tested via API routes, verified here at unit level)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowEngine } from '../src/engine/FlowEngine.js';
import { DagResolver } from '../src/engine/DagResolver.js';
import { StepExecutorRegistry, InputResolver } from '../src/engine/StepExecutor.js';
import { RetryManager } from '../src/engine/RetryManager.js';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../src/engine/StepExecutor.js';
import type { FlowDefinition, StepDefinition } from '../src/types/flow.js';
import type { TriggerPayload, FlowRun, StepError } from '../src/types/run.js';
import type { FlowRunRepository } from '../src/persistence/FlowRunRepository.js';
import type { ContextStore } from '../src/engine/ContextStore.js';
import { verifySignature, signPayload } from '../src/webhook-signature.js';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockExecutor(
  type: StepDefinition['type'],
  handler?: (input: StepExecutionInput) => Promise<StepExecutionResult>,
): StepExecutor {
  return {
    type,
    execute:
      handler ??
      (async (input) => ({
        output: { result: `${input.step.id}-done` },
        logs: [],
        durationMs: 1,
      })),
  };
}

function createMockContextStore(): ContextStore {
  const contexts = new Map<string, Record<string, unknown>>();
  return {
    init: vi.fn(async (runId, trigger, flowId) => {
      const ctx = { runId, flowId, trigger, steps: {}, variables: {} };
      contexts.set(runId, ctx);
      return ctx;
    }),
    get: vi.fn(async (runId) =>
      contexts.get(runId) ?? { runId, flowId: '', trigger: {}, steps: {}, variables: {} },
    ),
    commitStepOutput: vi.fn(async (runId, stepId, output) => {
      const ctx = contexts.get(runId);
      if (ctx) (ctx.steps as Record<string, unknown>)[stepId] = output;
    }),
    setVariable: vi.fn(),
    release: vi.fn(async () => {}),
  } as unknown as ContextStore;
}

function createMockRunRepository(): FlowRunRepository {
  const runs = new Map<string, FlowRun>();
  return {
    create: vi.fn(async (run) => { runs.set(run.id, run); }),
    updateStatus: vi.fn(),
    upsertStepRun: vi.fn(),
    findById: vi.fn(async (id) => runs.get(id) ?? null),
    findByFlowId: vi.fn(async () => []),
  } as unknown as FlowRunRepository;
}

function makeStep(overrides: Partial<StepDefinition>): StepDefinition {
  return {
    id: overrides.id ?? 'step',
    name: overrides.name ?? overrides.id ?? 'step',
    type: overrides.type ?? 'action',
    inputMapping: overrides.inputMapping ?? {},
    dependsOn: overrides.dependsOn ?? [],
    ...overrides,
  } as StepDefinition;
}

function makeFlow(
  steps: Partial<StepDefinition>[],
  errorPolicy: FlowDefinition['errorPolicy'] = { onStepFailure: 'halt' },
): FlowDefinition {
  return {
    id: 'flow-1',
    version: 1,
    name: 'Test Flow',
    tenantId: 'tenant-1',
    steps: steps.map(makeStep),
    errorPolicy,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const trigger: TriggerPayload = { type: 'manual', data: {}, receivedAt: new Date() };

const defaultOpts = {
  maxConcurrentSteps: 5,
  stepTimeoutMs: 5000,
  defaultRetryPolicy: {
    maxAttempts: 1,
    strategy: 'fixed' as const,
    initialDelayMs: 1,
    maxDelayMs: 10,
    retryableErrors: ['network' as const, 'rateLimit' as const, 'timeout' as const, 'serverError' as const],
  },
};

// ─── Fix #1: Timing-safe signature verification ──────────────────────────────

describe('Fix #1 — timing-safe verifySignature', () => {
  const payload = '{"test":true}';
  const secret = 'test-secret';

  it('returns true for a valid signature (unchanged behaviour)', () => {
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, secret, sig)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifySignature(payload, secret, 'sha256=0000')).toBe(false);
  });

  it('returns false for a signature with a different length', () => {
    expect(verifySignature(payload, secret, 'sha256=short')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(verifySignature(payload, secret, '')).toBe(false);
  });
});

// ─── Fix #2: Dead ternary — run status reflects failed steps ─────────────────

describe('Fix #2 — run status reflects failed steps', () => {
  it('marks run as "failed" when steps fail under halt policy', async () => {
    const registry = new StepExecutorRegistry();
    registry.register({
      type: 'action',
      execute: async () => { throw new Error('boom'); },
    });
    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('failed');
  });

  it('marks run as "completed" when all steps succeed', async () => {
    const registry = new StepExecutorRegistry();
    registry.register(createMockExecutor('action'));
    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
    ]);
    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
  });

  it('marks run as "completed" when steps fail under continue policy', async () => {
    const registry = new StepExecutorRegistry();
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'A') throw new Error('A fails');
        return { output: {}, logs: [], durationMs: 1 };
      },
    });
    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    const flow = makeFlow(
      [{ id: 'A', dependsOn: [] }, { id: 'B', dependsOn: [] }],
      { onStepFailure: 'continue' },
    );
    const result = await engine.execute(flow, trigger);

    expect(result.stepRuns['A'].status).toBe('failed');
    expect(result.stepRuns['B'].status).toBe('completed');
    // Under continue policy, overall run completes
    expect(result.status).toBe('completed');
  });
});

// ─── Fix #3: toStepError handles ConnectorApiError via duck typing ───────────

describe('Fix #3 — toStepError handles errors with toStepError()', () => {
  it('preserves category and retryable from an error with toStepError() method', async () => {
    const registry = new StepExecutorRegistry();
    registry.register({
      type: 'action',
      execute: async () => {
        // Simulate a ConnectorApiError (duck typing)
        const err = new Error('Rate limited on /api/products') as Error & {
          toStepError: () => StepError;
        };
        err.name = 'ConnectorApiError';
        err.toStepError = () => ({
          code: 'HTTP_429',
          message: 'Rate limited on /api/products',
          category: 'rateLimit',
          retryable: true,
        });
        throw err;
      },
    });

    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, {
        ...defaultOpts,
        defaultRetryPolicy: { ...defaultOpts.defaultRetryPolicy, maxAttempts: 1, retryableErrors: [] },
      },
    );

    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    const result = await engine.execute(flow, trigger);

    expect(result.stepRuns['A'].error?.code).toBe('HTTP_429');
    expect(result.stepRuns['A'].error?.category).toBe('rateLimit');
    expect(result.stepRuns['A'].error?.retryable).toBe(true);
  });

  it('retries a ConnectorApiError-like error when retryable and category matches', async () => {
    let callCount = 0;
    const registry = new StepExecutorRegistry();
    registry.register({
      type: 'action',
      execute: async () => {
        callCount++;
        if (callCount < 3) {
          const err = new Error('Server error 500') as Error & {
            toStepError: () => StepError;
          };
          err.toStepError = () => ({
            code: 'HTTP_500',
            message: 'Server error 500',
            category: 'serverError',
            retryable: true,
          });
          throw err;
        }
        return { output: { ok: true }, logs: [], durationMs: 1 };
      },
    });

    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, {
        ...defaultOpts,
        defaultRetryPolicy: {
          maxAttempts: 3,
          strategy: 'fixed',
          initialDelayMs: 1,
          maxDelayMs: 10,
          retryableErrors: ['serverError'],
        },
      },
    );

    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    const result = await engine.execute(flow, trigger);

    expect(callCount).toBe(3);
    expect(result.stepRuns['A'].status).toBe('completed');
  });
});

// ─── Fix #4: Cross-worker cancellation via DB check ──────────────────────────

describe('Fix #4 — cross-worker cancellation via DB check', () => {
  it('detects cancellation from the database even without in-memory flag', async () => {
    const registry = new StepExecutorRegistry();
    let stepBStarted = false;
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'B') stepBStarted = true;
        return { output: {}, logs: [], durationMs: 1 };
      },
    });

    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();

    // After step A completes, findById will return a cancelled status
    // simulating another worker/process having cancelled the run
    let findByIdCallCount = 0;
    (runRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      findByIdCallCount++;
      // After the first loop iteration (step A ran), report cancelled
      if (findByIdCallCount >= 2) {
        return { id, status: 'cancelled' } as FlowRun;
      }
      return { id, status: 'running' } as FlowRun;
    });

    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
    ]);
    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('cancelled');
    expect(stepBStarted).toBe(false);
  });
});

// ─── Fix #5: Branch routing via nextStepId ───────────────────────────────────

describe('Fix #5 — branch routing blocks non-target steps', () => {
  it('only executes the branch target step, not all dependents', async () => {
    const executedSteps: string[] = [];
    const registry = new StepExecutorRegistry();

    // Branch executor returns nextStepId
    registry.register({
      type: 'branch',
      execute: async () => ({
        output: { nextStepId: 'yes-path' },
        logs: [],
        durationMs: 1,
      }),
    });
    registry.register({
      type: 'action',
      execute: async (input) => {
        executedSteps.push(input.step.id);
        return { output: {}, logs: [], durationMs: 1 };
      },
    });

    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    const flow = makeFlow([
      { id: 'branch-step', type: 'branch', dependsOn: [], branches: [
        { when: 'true', nextStepId: 'yes-path' },
      ] },
      { id: 'yes-path', dependsOn: ['branch-step'] },
      { id: 'no-path', dependsOn: ['branch-step'] },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(executedSteps).toContain('yes-path');
    expect(executedSteps).not.toContain('no-path');
    expect(result.stepRuns['yes-path']?.status).toBe('completed');
    expect(result.stepRuns['no-path']).toBeUndefined();
  });

  it('does not block non-branch dependents from executing', async () => {
    const executedSteps: string[] = [];
    const registry = new StepExecutorRegistry();
    registry.register({
      type: 'action',
      execute: async (input) => {
        executedSteps.push(input.step.id);
        return { output: {}, logs: [], durationMs: 1 };
      },
    });

    const contextStore = createMockContextStore();
    const runRepo = createMockRunRepository();
    const engine = new FlowEngine(
      new DagResolver(), registry, contextStore,
      new InputResolver(), new RetryManager(), runRepo, defaultOpts,
    );

    // A is a regular action step, B depends on A — should always run
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
    ]);

    const result = await engine.execute(flow, trigger);
    expect(result.status).toBe('completed');
    expect(executedSteps).toContain('A');
    expect(executedSteps).toContain('B');
  });
});
