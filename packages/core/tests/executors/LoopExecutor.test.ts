import { describe, it, expect } from 'vitest';
import { LoopExecutor } from '../../src/executors/LoopExecutor.js';
import type { StepExecutionInput } from '../../src/engine/StepExecutor.js';
import type { StepDefinition } from '../../src/types/flow.js';
import type { FlowContext } from '../../src/types/run.js';

function makeContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: { items: ['a', 'b', 'c'] }, receivedAt: new Date() },
    steps: {},
    variables: {},
    ...overrides,
  };
}

function makeStep(loopOver?: string, overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: 'loop-1',
    name: 'Loop Step',
    type: 'loop',
    inputMapping: {},
    dependsOn: [],
    loopOver,
    ...overrides,
  };
}

function makeInput(
  step: StepDefinition,
  resolvedInputs: Record<string, unknown> = {},
  contextOverrides: Partial<FlowContext> = {}
): StepExecutionInput {
  return {
    step,
    resolvedInputs,
    context: makeContext(contextOverrides),
    attempt: 1,
  };
}

describe('LoopExecutor', () => {
  const executor = new LoopExecutor();

  it('has type "loop"', () => {
    expect(executor.type).toBe('loop');
  });

  it('throws when loopOver is not set on the step', async () => {
    const step = makeStep(undefined);
    await expect(executor.execute(makeInput(step))).rejects.toThrow('has no loopOver path');
  });

  it('iterates over a JSONPath array and returns items with index', async () => {
    const step = makeStep('$.trigger.data.items');
    const result = await executor.execute(makeInput(step));

    expect(result.output.count).toBe(3);
    const iterations = result.output.items as Array<Record<string, unknown>>;
    expect(iterations).toHaveLength(3);
    expect(iterations[0]).toMatchObject({ index: 0, item: 'a' });
    expect(iterations[1]).toMatchObject({ index: 1, item: 'b' });
    expect(iterations[2]).toMatchObject({ index: 2, item: 'c' });
  });

  it('wraps a non-array JSONPath result in an array', async () => {
    // JSONPath targeting a single scalar value
    const step = makeStep('$.trigger.data.items[0]');
    const result = await executor.execute(makeInput(step));

    expect(result.output.count).toBe(1);
    const iterations = result.output.items as Array<Record<string, unknown>>;
    expect(iterations[0]).toMatchObject({ index: 0, item: 'a' });
  });

  it('iterates over items from steps context', async () => {
    const step = makeStep('$.steps.prevStep.data.records');
    const contextOverrides: Partial<FlowContext> = {
      steps: {
        prevStep: {
          data: { records: [{ id: 1 }, { id: 2 }] },
          completedAt: new Date(),
          durationMs: 5,
        },
      },
    };
    const result = await executor.execute(makeInput(step, {}, contextOverrides));

    expect(result.output.count).toBe(2);
    const iterations = result.output.items as Array<Record<string, unknown>>;
    expect(iterations[0]).toMatchObject({ index: 0, item: { id: 1 } });
    expect(iterations[1]).toMatchObject({ index: 1, item: { id: 2 } });
  });

  it('merges resolvedInputs into each iteration object', async () => {
    const step = makeStep('$.trigger.data.items');
    const resolvedInputs = { batchSize: 10 };
    const result = await executor.execute(makeInput(step, resolvedInputs));

    const iterations = result.output.items as Array<Record<string, unknown>>;
    expect(iterations[0]).toMatchObject({ batchSize: 10 });
    expect(iterations[1]).toMatchObject({ batchSize: 10 });
  });

  it('handles an empty array gracefully', async () => {
    const step = makeStep('$.trigger.data.empty');
    const contextOverrides: Partial<FlowContext> = {
      trigger: { type: 'manual', data: { empty: [] }, receivedAt: new Date() },
    };
    const result = await executor.execute(makeInput(step, {}, contextOverrides));

    expect(result.output.count).toBe(0);
    expect(result.output.items).toEqual([]);
  });

  it('returns a log entry with the item count', async () => {
    const step = makeStep('$.trigger.data.items');
    const result = await executor.execute(makeInput(step));

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('3 items');
  });

  it('returns a non-negative durationMs', async () => {
    const step = makeStep('$.trigger.data.items');
    const result = await executor.execute(makeInput(step));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
