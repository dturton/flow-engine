/**
 * Additional FlowEngine tests covering: resume(), goto error policy,
 * maxConcurrentSteps batching, and context commitStepOutput verification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowEngine } from '../src/engine/FlowEngine.js';
import { DagResolver } from '../src/engine/DagResolver.js';
import { StepExecutorRegistry, InputResolver } from '../src/engine/StepExecutor.js';
import { RetryManager } from '../src/engine/RetryManager.js';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../src/engine/StepExecutor.js';
import type { FlowDefinition, StepDefinition } from '../src/types/flow.js';
import type { TriggerPayload, FlowRun } from '../src/types/run.js';
import type { FlowRunRepository } from '../src/persistence/FlowRunRepository.js';
import type { ContextStore } from '../src/engine/ContextStore.js';

function createMockExecutor(
  type: StepDefinition['type'],
  handler?: (input: StepExecutionInput) => Promise<StepExecutionResult>
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

function createMockRunRepository(existingRun?: FlowRun): FlowRunRepository {
  const runs = new Map<string, FlowRun>();
  if (existingRun) {
    runs.set(existingRun.id, existingRun);
  }
  return {
    create: vi.fn(async (run) => {
      runs.set(run.id, run);
    }),
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
  errorPolicy: FlowDefinition['errorPolicy'] = { onStepFailure: 'halt' }
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

const trigger: TriggerPayload = {
  type: 'manual',
  data: {},
  receivedAt: new Date(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('FlowEngine (extended)', () => {
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
      {
        maxConcurrentSteps: 5,
        stepTimeoutMs: 5000,
        defaultRetryPolicy: {
          maxAttempts: 1,
          strategy: 'fixed',
          initialDelayMs: 1,
          maxDelayMs: 10,
          retryableErrors: [],
        },
      }
    );
  });

  // ── goto error policy ──────────────────────────────────────────────────────

  it('applies goto error policy: redirects to errorStepId when a step fails', async () => {
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
        { id: 'error-handler', dependsOn: [] },
      ],
      { onStepFailure: 'goto', errorStepId: 'error-handler' }
    );

    const result = await engine.execute(flow, trigger);

    // The error-handler step should have been executed
    expect(result.stepRuns['error-handler']).toBeDefined();
    expect(result.stepRuns['error-handler'].status).toBe('completed');
  });

  // ── resume ─────────────────────────────────────────────────────────────────

  it('resume throws when the run is not found', async () => {
    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);

    await expect(engine.resume('non-existent-run', flow)).rejects.toThrow('Run not found: non-existent-run');
  });

  it('resume re-executes a step that failed and completes successfully', async () => {
    let bCallCount = 0;
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'B') {
          bCallCount++;
          // Fail on the first call (during initial execute), succeed on subsequent calls
          if (bCallCount === 1) throw new Error('B transient');
        }
        return { output: { ok: true }, logs: [], durationMs: 1 };
      },
    });

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
    ]);

    // First run: A completes, B fails
    const firstRun = await engine.execute(flow, trigger);
    expect(firstRun.stepRuns['B'].status).toBe('failed');

    // Resume from B: the repo must know about the existing run
    const runRepoWithRun = createMockRunRepository(firstRun);
    const resumeEngine = new FlowEngine(
      new DagResolver(),
      registry,
      contextStore,
      new InputResolver(),
      new RetryManager(),
      runRepoWithRun,
      {
        maxConcurrentSteps: 5,
        stepTimeoutMs: 5000,
        defaultRetryPolicy: {
          maxAttempts: 1,
          strategy: 'fixed',
          initialDelayMs: 1,
          maxDelayMs: 10,
          retryableErrors: [],
        },
      }
    );

    const resumed = await resumeEngine.resume(firstRun.id, flow, 'B');
    // B is now attempted a second time and succeeds
    expect(resumed.stepRuns['B'].status).toBe('completed');
    expect(resumed.status).toBe('completed');
  });

  it('resume with fromStepId re-runs the step and its dependents', async () => {
    let cCallCount = 0;
    registry.register({
      type: 'action',
      execute: async (input) => {
        if (input.step.id === 'C') cCallCount++;
        return { output: { ok: true }, logs: [], durationMs: 1 };
      },
    });

    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ]);

    // Simulate a run that already completed A and B but C was never run
    const partialRun: FlowRun = {
      id: 'resume-run-1',
      flowId: flow.id,
      flowVersion: flow.version,
      tenantId: flow.tenantId,
      status: 'failed',
      trigger,
      startedAt: new Date(),
      stepRuns: {
        A: { stepId: 'A', status: 'completed', attempt: 1, input: {}, output: {}, logs: [] },
        B: { stepId: 'B', status: 'completed', attempt: 1, input: {}, output: {}, logs: [] },
        C: {
          stepId: 'C',
          status: 'failed',
          attempt: 1,
          input: {},
          logs: [],
          error: { code: 'ERR', message: 'fail', category: 'unknown', retryable: false },
        },
      },
    };

    const runRepoWithRun = createMockRunRepository(partialRun);
    const resumeEngine = new FlowEngine(
      new DagResolver(),
      registry,
      contextStore,
      new InputResolver(),
      new RetryManager(),
      runRepoWithRun,
      {
        maxConcurrentSteps: 5,
        stepTimeoutMs: 5000,
        defaultRetryPolicy: {
          maxAttempts: 1,
          strategy: 'fixed',
          initialDelayMs: 1,
          maxDelayMs: 10,
          retryableErrors: [],
        },
      }
    );

    const result = await resumeEngine.resume('resume-run-1', flow, 'C');

    expect(cCallCount).toBe(1);
    expect(result.stepRuns['C'].status).toBe('completed');
    expect(result.status).toBe('completed');
  });

  // ── maxConcurrentSteps batching ────────────────────────────────────────────

  it('batches steps up to maxConcurrentSteps when multiple steps are ready', async () => {
    const executionOrder: string[] = [];
    registry.register({
      type: 'action',
      execute: async (input) => {
        executionOrder.push(input.step.id);
        return { output: {}, logs: [], durationMs: 1 };
      },
    });

    // 4 independent steps + 1 depends on all
    const flow = makeFlow([
      { id: 'A', dependsOn: [] },
      { id: 'B', dependsOn: [] },
      { id: 'C', dependsOn: [] },
      { id: 'D', dependsOn: [] },
      { id: 'E', dependsOn: ['A', 'B', 'C', 'D'] },
    ]);

    const limitedEngine = new FlowEngine(
      new DagResolver(),
      registry,
      contextStore,
      new InputResolver(),
      new RetryManager(),
      runRepo,
      {
        maxConcurrentSteps: 2,
        stepTimeoutMs: 5000,
        defaultRetryPolicy: {
          maxAttempts: 1,
          strategy: 'fixed',
          initialDelayMs: 1,
          maxDelayMs: 10,
          retryableErrors: [],
        },
      }
    );

    const result = await limitedEngine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    // All 5 steps should have been executed
    expect(Object.keys(result.stepRuns)).toHaveLength(5);
    // E should have been executed after all others
    expect(executionOrder[executionOrder.length - 1]).toBe('E');
  });

  // ── context commit ─────────────────────────────────────────────────────────

  it('commits step output to the context store after each completed step', async () => {
    registry.register({
      type: 'action',
      execute: async () => ({
        output: { value: 42 },
        logs: [],
        durationMs: 1,
      }),
    });

    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    await engine.execute(flow, trigger);

    expect(contextStore.commitStepOutput).toHaveBeenCalledWith(
      expect.any(String),
      'A',
      expect.objectContaining({ data: { value: 42 } })
    );
  });

  // ── context store release ──────────────────────────────────────────────────

  it('always releases the context store even when the flow fails', async () => {
    registry.register({
      type: 'action',
      execute: async () => {
        throw new Error('fatal');
      },
    });

    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    await engine.execute(flow, trigger);

    expect(contextStore.release).toHaveBeenCalled();
  });

  // ── status repository interactions ─────────────────────────────────────────

  it('calls runRepository.create at the start of execute', async () => {
    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    await engine.execute(flow, trigger);
    expect(runRepo.create).toHaveBeenCalledTimes(1);
  });

  it('updates status to "running" then to final status', async () => {
    const flow = makeFlow([{ id: 'A', dependsOn: [] }]);
    await engine.execute(flow, trigger);

    const calls = (runRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1]).toBe('running');
    // Final call should be 'completed'
    expect(calls[calls.length - 1][1]).toBe('completed');
  });
});
