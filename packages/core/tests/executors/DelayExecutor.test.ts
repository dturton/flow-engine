import { describe, it, expect, vi } from 'vitest';
import { DelayExecutor } from '../../src/executors/DelayExecutor.js';
import type { StepExecutionInput } from '../../src/engine/StepExecutor.js';
import type { StepDefinition } from '../../src/types/flow.js';
import type { FlowContext } from '../../src/types/run.js';

function makeContext(): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: {}, receivedAt: new Date() },
    steps: {},
    variables: {},
  };
}

function makeStep(): StepDefinition {
  return {
    id: 'delay-1',
    name: 'Delay Step',
    type: 'delay',
    inputMapping: {},
    dependsOn: [],
  };
}

function makeInput(resolvedInputs: Record<string, unknown>): StepExecutionInput {
  return {
    step: makeStep(),
    resolvedInputs,
    context: makeContext(),
    attempt: 1,
  };
}

describe('DelayExecutor', () => {
  it('has type "delay"', () => {
    const executor = new DelayExecutor();
    expect(executor.type).toBe('delay');
  });

  it('waits for the specified number of milliseconds', async () => {
    const executor = new DelayExecutor();
    const start = Date.now();
    await executor.execute(makeInput({ delayMs: 50 }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow a small variance
  });

  it('returns output with delayed: true and the actual delayMs', async () => {
    const executor = new DelayExecutor();
    const result = await executor.execute(makeInput({ delayMs: 10 }));
    expect(result.output).toEqual({ delayed: true, delayMs: 10 });
  });

  it('parses a string delayMs value', async () => {
    const executor = new DelayExecutor();
    const result = await executor.execute(makeInput({ delayMs: '20' }));
    expect(result.output).toEqual({ delayed: true, delayMs: 20 });
  });

  it('defaults to 1000ms when delayMs is missing', async () => {
    vi.useFakeTimers();
    const executor = new DelayExecutor();

    const promise = executor.execute(makeInput({}));
    vi.advanceTimersByTime(1000);
    const result = await promise;

    expect(result.output).toEqual({ delayed: true, delayMs: 1000 });
    vi.useRealTimers();
  });

  it('returns a log entry with the step id and delay duration', async () => {
    const executor = new DelayExecutor();
    const result = await executor.execute(makeInput({ delayMs: 10 }));

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('delay-1');
    expect(result.logs[0].message).toContain('10ms');
  });

  it('returns a non-negative durationMs', async () => {
    const executor = new DelayExecutor();
    const result = await executor.execute(makeInput({ delayMs: 10 }));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
