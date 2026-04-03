import { describe, it, expect } from 'vitest';
import { ScriptExecutor } from '../../src/executors/ScriptExecutor.js';
import type { StepExecutionInput } from '../../src/engine/StepExecutor.js';
import type { StepDefinition } from '../../src/types/flow.js';
import type { FlowContext } from '../../src/types/run.js';

function makeContext(): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: { value: 10 }, receivedAt: new Date() },
    steps: {},
    variables: { multiplier: 3 },
  };
}

function makeStep(id = 'script-1'): StepDefinition {
  return {
    id,
    name: 'Script Step',
    type: 'script',
    inputMapping: {},
    dependsOn: [],
  };
}

function makeInput(script: unknown, overrides: Partial<StepExecutionInput> = {}): StepExecutionInput {
  return {
    step: makeStep(),
    resolvedInputs: { script },
    context: makeContext(),
    attempt: 1,
    ...overrides,
  };
}

describe('ScriptExecutor', () => {
  const executor = new ScriptExecutor();

  it('has type "script"', () => {
    expect(executor.type).toBe('script');
  });

  it('throws when script input is not a string', async () => {
    await expect(executor.execute(makeInput(42))).rejects.toThrow('script input must be a string');
    await expect(executor.execute(makeInput(null))).rejects.toThrow('script input must be a string');
    await expect(executor.execute(makeInput(undefined))).rejects.toThrow('script input must be a string');
  });

  it('executes a script and returns output set via sandbox.output', async () => {
    const script = 'output = { result: 42 };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ result: 42 });
  });

  it('wraps a non-object output value in { result: <value> }', async () => {
    const script = 'output = "hello";';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ result: 'hello' });
  });

  it('returns { result: undefined } when output is not set', async () => {
    const script = '// do nothing';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ result: undefined });
  });

  it('wraps null output in { result: null }', async () => {
    const script = 'output = null;';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ result: null });
  });

  it('provides inputs in the sandbox', async () => {
    const script = 'output = { echoed: inputs.name };';
    const result = await executor.execute(
      makeInput(script, { resolvedInputs: { script, name: 'Alice' } })
    );
    expect(result.output).toEqual({ echoed: 'Alice' });
  });

  it('provides context.trigger in the sandbox', async () => {
    const script = 'output = { triggerType: context.trigger.type };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ triggerType: 'manual' });
  });

  it('provides context.variables in the sandbox', async () => {
    const script = 'output = { m: context.variables.multiplier };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ m: 3 });
  });

  it('blocks access to require', async () => {
    const script = 'output = { hasRequire: typeof require };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ hasRequire: 'undefined' });
  });

  it('blocks access to process', async () => {
    const script = 'output = { hasProcess: typeof process };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ hasProcess: 'undefined' });
  });

  it('blocks access to global', async () => {
    const script = 'output = { hasGlobal: typeof global };';
    const result = await executor.execute(makeInput(script));
    expect(result.output).toEqual({ hasGlobal: 'undefined' });
  });

  it('throws on script syntax errors', async () => {
    const script = 'output = {{{;';
    await expect(executor.execute(makeInput(script))).rejects.toThrow();
  });

  it('throws on script runtime errors', async () => {
    const script = 'throw new Error("deliberate error");';
    await expect(executor.execute(makeInput(script))).rejects.toThrow('deliberate error');
  });

  it('enforces a timeout for long-running scripts', async () => {
    // This test uses a tight internal timeout; we rely on the 5000ms VM timeout
    // but we just confirm an infinite loop eventually throws
    const script = 'while(true){}';
    await expect(executor.execute(makeInput(script))).rejects.toThrow();
  }, 10_000);

  it('returns a log entry with the step id', async () => {
    const script = 'output = {};';
    const result = await executor.execute(makeInput(script));
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('script-1');
  });

  it('returns a non-negative durationMs', async () => {
    const script = 'output = {};';
    const result = await executor.execute(makeInput(script));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
