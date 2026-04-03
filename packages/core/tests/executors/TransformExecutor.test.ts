import { describe, it, expect } from 'vitest';
import { TransformExecutor } from '../../src/executors/TransformExecutor.js';
import type { StepExecutionInput } from '../../src/engine/StepExecutor.js';
import type { StepDefinition } from '../../src/types/flow.js';
import type { FlowContext } from '../../src/types/run.js';

function makeInput(overrides: Partial<StepExecutionInput> = {}): StepExecutionInput {
  const step: StepDefinition = {
    id: 'transform-1',
    name: 'Transform Step',
    type: 'transform',
    inputMapping: {},
    dependsOn: [],
  };
  const context: FlowContext = {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: {}, receivedAt: new Date() },
    steps: {},
    variables: {},
  };
  return { step, resolvedInputs: {}, context, attempt: 1, ...overrides };
}

describe('TransformExecutor', () => {
  const executor = new TransformExecutor();

  it('has type "transform"', () => {
    expect(executor.type).toBe('transform');
  });

  it('returns resolvedInputs as the output', async () => {
    const resolvedInputs = { name: 'Alice', age: 30 };
    const result = await executor.execute(makeInput({ resolvedInputs }));

    expect(result.output).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns a shallow copy of resolvedInputs (not the same reference)', async () => {
    const resolvedInputs = { key: 'value' };
    const result = await executor.execute(makeInput({ resolvedInputs }));

    expect(result.output).not.toBe(resolvedInputs);
    expect(result.output).toEqual(resolvedInputs);
  });

  it('returns an empty object when resolvedInputs is empty', async () => {
    const result = await executor.execute(makeInput({ resolvedInputs: {} }));
    expect(result.output).toEqual({});
  });

  it('returns durationMs as a non-negative number', async () => {
    const result = await executor.execute(makeInput());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns a log entry with the step id', async () => {
    const result = await executor.execute(makeInput());
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('transform-1');
  });

  it('handles resolvedInputs with nested objects', async () => {
    const resolvedInputs = { nested: { a: 1, b: [2, 3] } };
    const result = await executor.execute(makeInput({ resolvedInputs }));
    expect(result.output).toEqual({ nested: { a: 1, b: [2, 3] } });
  });
});
