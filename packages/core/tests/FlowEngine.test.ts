import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowEngine } from '../src/engine/FlowEngine.js';
import { DagResolver } from '../src/engine/DagResolver.js';
import { StepExecutorRegistry, InputResolver } from '../src/engine/StepExecutor.js';
import { RetryManager } from '../src/engine/RetryManager.js';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../src/engine/StepExecutor.js';
import type { FlowDefinition, StepDefinition, RetryPolicy } from '../src/types/flow.js';
import type { TriggerPayload, FlowRun, StepRun } from '../src/types/run.js';
import type { FlowRunRepository } from '../src/persistence/FlowRunRepository.js';
import type { ContextStore } from '../src/engine/ContextStore.js';

// Simple mock executor that succeeds by default
function createMockExecutor(type: StepDefinition['type'], handler?: (input: StepExecutionInput) => Promise<StepExecutionResult>): StepExecutor {
  return {
    type,
    execute: handler ?? (async (input) => ({
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
    get: vi.fn(async (runId) => {
      return contexts.get(runId) ?? { runId, flowId: '', trigger: {}, steps: {}, variables: {} };
    }),
    commitStepOutput: vi.fn(async (runId, stepId, output) => {
      const ctx = contexts.get(runId);
      if (ctx) {
        (ctx.steps as Record<string, unknown>)[stepId] = output;
      }
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

function makeFlow(steps: Partial<StepDefinition>[], errorPolicy: FlowDefinition['errorPolicy'] = { onStepFailure: 'halt' }): FlowDefinition {
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

const trigger: TriggerPayload = {
  type: 'manual',
  data: {},
  receivedAt: new Date(),
};

describe('FlowEngine', () => {
  let registry: StepExecutorRegistry;
  let contextStore: ContextStore;
  let runRepo: FlowRunRepository;
  let engine: FlowEngine;

  beforeEach(() => {
    registry = new StepExecutorRegistry();
    registry.register(createMockExecutor('action'));
    registry.register(createMockExecutor('transform'));
    registry.register(createMockExecutor('branch'));
    registry.register(createMockExecutor('script'));

    contextStore = createMockContextStore();
    runRepo = createMockRunRepository();

    engine = new FlowEngine(
      new DagResolver(),
      registry,
      contextStore,
      new InputResolver(),
      new RetryManager(),
      runRepo,
      { maxConcurrentSteps: 5, stepTimeoutMs: 5000, defaultRetryPolicy: { maxAttempts: 3, strategy: 'fixed', initialDelayMs: 10, maxDelayMs: 100, retryableErrors: ['network', 'rateLimit', 'timeout', 'serverError'] } }
    );
  });

  it('executes a 3-step linear flow and returns a completed FlowRun', async () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['A'].status).toBe('completed');
    expect(result.stepRuns['B'].status).toBe('completed');
    expect(result.stepRuns['C'].status).toBe('completed');
  });

  it('executes a diamond flow (B and C run after A, D waits for both)', async () => {
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['A'] },
      { id: 'D', dependsOn: ['B', 'C'] },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(Object.keys(result.stepRuns)).toHaveLength(4);
    expect(result.stepRuns['D'].status).toBe('completed');
  });

  it('retries a failing step up to maxAttempts then marks it failed', async () => {
    let callCount = 0;
    registry.register({
      type: 'action',
      execute: async () => {
        callCount++;
        // Throw a StepTimeoutError which maps to category 'timeout' and retryable: true
        const { StepTimeoutError } = await import('../src/errors.js');
        throw new StepTimeoutError('transient timeout');
      },
    });

    const flow = makeFlow([
      { id: 'A', dependsOn: [], retryPolicy: { maxAttempts: 3, strategy: 'fixed', initialDelayMs: 1, maxDelayMs: 10, retryableErrors: ['network', 'rateLimit', 'timeout', 'serverError'] } },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(result.stepRuns['A'].status).toBe('failed');
    // The step should have been attempted 3 times (the max)
    expect(result.stepRuns['A'].attempt).toBe(3);
  });

  it('applies halt error policy: stops the run when a step permanently fails', async () => {
    registry.register({
      type: 'action',
      execute: async () => { throw new Error('fatal'); },
    });

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('failed');
    expect(result.error?.stepId).toBe('A');
    expect(result.stepRuns['B']).toBeUndefined();
  });

  it('applies continue error policy: marks step failed but continues remaining steps', async () => {
    let callIndex = 0;
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'A') throw new Error('A fails');
        return { output: { ok: true }, logs: [], durationMs: 1 };
      },
    });

    const flow = makeFlow(
      [
        { id: 'A', dependsOn: [] },
        { id: 'B', dependsOn: [] },
      ],
      { onStepFailure: 'continue' }
    );

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['A'].status).toBe('failed');
    expect(result.stepRuns['B'].status).toBe('completed');
  });

  it('cancel transitions run status to cancelled and prevents new steps from starting', async () => {
    let resolveStep: (() => void) | undefined;
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'A') {
          return { output: {}, logs: [], durationMs: 1 };
        }
        // B will block until cancelled
        await new Promise<void>((resolve) => { resolveStep = resolve; });
        return { output: {}, logs: [], durationMs: 1 };
      },
    });

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ]);

    // Start execution in background
    const executePromise = engine.execute(flow, trigger);

    // Wait a tick for the engine to get going then cancel
    await new Promise((r) => setTimeout(r, 50));
    // We need the runId — since we can't easily get it, we'll cancel via the repository mock
    // Instead, let's test the simpler scenario: cancel before step B can run
    const runs = (runRepo.create as ReturnType<typeof vi.fn>).mock.calls;
    if (runs.length > 0) {
      const runId = runs[0][0].id;
      await engine.cancel(runId);
    }

    if (resolveStep) resolveStep();
    const result = await executePromise;

    expect(result.status).toBe('cancelled');
  });

  it('step timeout causes the step to fail with category: timeout', async () => {
    registry.register({
      type: 'action',
      execute: async () => {
        await new Promise((r) => setTimeout(r, 10_000));
        return { output: {}, logs: [], durationMs: 10_000 };
      },
    });

    const timeoutEngine = new FlowEngine(
      new DagResolver(),
      registry,
      contextStore,
      new InputResolver(),
      new RetryManager(),
      runRepo,
      { maxConcurrentSteps: 5, stepTimeoutMs: 100, defaultRetryPolicy: { maxAttempts: 1, strategy: 'fixed', initialDelayMs: 1, maxDelayMs: 10, retryableErrors: [] } }
    );

    const flow = makeFlow([{ id: 'A', dependsOn: [], timeoutMs: 50 }]);
    const result = await timeoutEngine.execute(flow, trigger);

    expect(result.stepRuns['A'].status).toBe('failed');
    expect(result.stepRuns['A'].error?.category).toBe('timeout');
  });
});
