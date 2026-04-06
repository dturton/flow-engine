/**
 * Integration tests: FlowEngine + ScriptExecutor + flow-level functions.
 * Verifies that functions defined on FlowDefinition are available inside script steps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowEngine } from '../src/engine/FlowEngine.js';
import { DagResolver } from '../src/engine/DagResolver.js';
import { StepExecutorRegistry, InputResolver } from '../src/engine/StepExecutor.js';
import { RetryManager } from '../src/engine/RetryManager.js';
import { ScriptExecutor } from '../src/executors/ScriptExecutor.js';
import type { FlowDefinition, StepDefinition, FlowFunction } from '../src/types/flow.js';
import type { TriggerPayload, FlowRun } from '../src/types/run.js';
import type { FlowRunRepository } from '../src/persistence/FlowRunRepository.js';
import type { ContextStore } from '../src/engine/ContextStore.js';

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

function makeFlow(
  steps: Partial<StepDefinition>[],
  functions?: FlowFunction[],
): FlowDefinition {
  return {
    id: 'flow-1',
    version: 1,
    name: 'Test Flow',
    tenantId: 'tenant-1',
    steps: steps.map((s) => ({
      id: s.id ?? 'step',
      name: s.name ?? s.id ?? 'step',
      type: s.type ?? 'script',
      inputMapping: s.inputMapping ?? {},
      dependsOn: s.dependsOn ?? [],
      ...s,
    })) as StepDefinition[],
    functions,
    errorPolicy: { onStepFailure: 'halt' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const trigger: TriggerPayload = {
  type: 'manual',
  data: {},
  receivedAt: new Date(),
};

describe('FlowEngine — flow functions integration', () => {
  let engine: FlowEngine;
  let contextStore: ContextStore;
  let runRepo: FlowRunRepository;

  beforeEach(() => {
    const registry = new StepExecutorRegistry();
    registry.register(new ScriptExecutor());

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
      },
    );
  });

  it('script step can call a flow-level function and produce output', async () => {
    const flow = makeFlow(
      [
        {
          id: 'calc',
          type: 'script',
          inputMapping: {
            script: { type: 'literal', value: 'output = { result: double(21) };' },
          },
          dependsOn: [],
        },
      ],
      [{ name: 'double', params: ['x'], body: 'return x * 2;' }],
    );

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['calc'].output).toEqual({ result: 42 });
  });

  it('flow functions can call each other across steps', async () => {
    const flow = makeFlow(
      [
        {
          id: 'step1',
          type: 'script',
          inputMapping: {
            script: { type: 'literal', value: 'output = { val: sumOfSquares(3, 4) };' },
          },
          dependsOn: [],
        },
      ],
      [
        { name: 'square', params: ['x'], body: 'return x * x;' },
        { name: 'sumOfSquares', params: ['a', 'b'], body: 'return square(a) + square(b);' },
      ],
    );

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['step1'].output).toEqual({ val: 25 });
  });

  it('flow without functions still works for script steps', async () => {
    const flow = makeFlow([
      {
        id: 'plain',
        type: 'script',
        inputMapping: {
          script: { type: 'literal', value: 'output = { ok: true };' },
        },
        dependsOn: [],
      },
    ]);

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['plain'].output).toEqual({ ok: true });
  });

  it('functions are available to all steps in a multi-step flow', async () => {
    const flow = makeFlow(
      [
        {
          id: 'A',
          type: 'script',
          inputMapping: {
            script: { type: 'literal', value: 'output = { val: inc(10) };' },
          },
          dependsOn: [],
        },
        {
          id: 'B',
          type: 'script',
          inputMapping: {
            script: { type: 'literal', value: 'output = { val: inc(20) };' },
          },
          dependsOn: ['A'],
        },
      ],
      [{ name: 'inc', params: ['n'], body: 'return n + 1;' }],
    );

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('completed');
    expect(result.stepRuns['A'].output).toEqual({ val: 11 });
    expect(result.stepRuns['B'].output).toEqual({ val: 21 });
  });

  it('function with a syntax error causes the step to fail', async () => {
    const flow = makeFlow(
      [
        {
          id: 'bad',
          type: 'script',
          inputMapping: {
            script: { type: 'literal', value: 'output = broken();' },
          },
          dependsOn: [],
        },
      ],
      [{ name: 'broken', params: [], body: 'return {{{;' }],
    );

    const result = await engine.execute(flow, trigger);

    expect(result.status).toBe('failed');
    expect(result.stepRuns['bad'].status).toBe('failed');
  });
});
