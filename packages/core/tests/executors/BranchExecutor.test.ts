import { describe, it, expect } from 'vitest';
import { BranchExecutor } from '../../src/executors/BranchExecutor.js';
import { BranchResolutionError } from '../../src/errors.js';
import type { StepExecutionInput } from '../../src/engine/StepExecutor.js';
import type { StepDefinition, BranchCase } from '../../src/types/flow.js';
import type { FlowContext } from '../../src/types/run.js';

function makeContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: { type: 'manual', data: { status: 'approved' }, receivedAt: new Date() },
    steps: {},
    variables: {},
    ...overrides,
  };
}

function makeStep(branches: BranchCase[], overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: 'branch-1',
    name: 'Branch Step',
    type: 'branch',
    inputMapping: {},
    dependsOn: [],
    branches,
    ...overrides,
  };
}

function makeInput(step: StepDefinition, contextOverrides: Partial<FlowContext> = {}): StepExecutionInput {
  return {
    step,
    resolvedInputs: {},
    context: makeContext(contextOverrides),
    attempt: 1,
  };
}

describe('BranchExecutor', () => {
  const executor = new BranchExecutor();

  it('has type "branch"', () => {
    expect(executor.type).toBe('branch');
  });

  it('throws BranchResolutionError when step has no branches', async () => {
    const step = makeStep([]);
    await expect(executor.execute(makeInput(step))).rejects.toThrow(BranchResolutionError);
    await expect(executor.execute(makeInput(step))).rejects.toThrow('no branch cases defined');
  });

  it('throws BranchResolutionError when step.branches is undefined', async () => {
    const step = makeStep([], { branches: undefined });
    await expect(executor.execute(makeInput(step))).rejects.toThrow(BranchResolutionError);
  });

  it('returns the nextStepId of the first matching branch', async () => {
    const branches: BranchCase[] = [
      { when: 'trigger.data.status = "approved"', nextStepId: 'approve-step' },
      { when: 'trigger.data.status = "rejected"', nextStepId: 'reject-step' },
    ];
    const step = makeStep(branches);
    const result = await executor.execute(makeInput(step));

    expect(result.output).toEqual({ nextStepId: 'approve-step' });
  });

  it('evaluates branches in order and picks the first match', async () => {
    const branches: BranchCase[] = [
      { when: 'trigger.data.status = "rejected"', nextStepId: 'reject-step' },
      { when: 'trigger.data.status = "approved"', nextStepId: 'approve-step' },
    ];
    const step = makeStep(branches);
    const result = await executor.execute(makeInput(step));

    // Only second branch matches; first doesn't
    expect(result.output).toEqual({ nextStepId: 'approve-step' });
  });

  it('throws BranchResolutionError when no branch matches', async () => {
    const branches: BranchCase[] = [
      { when: 'trigger.data.status = "rejected"', nextStepId: 'reject-step' },
    ];
    const step = makeStep(branches);
    // trigger.data.status is "approved", not "rejected"
    await expect(executor.execute(makeInput(step))).rejects.toThrow(BranchResolutionError);
    await expect(executor.execute(makeInput(step))).rejects.toThrow('No branch matched');
  });

  it('can evaluate expressions against context.steps values', async () => {
    const branches: BranchCase[] = [
      { when: 'steps.fetchOrder.data.total > 100', nextStepId: 'big-order' },
      { when: 'steps.fetchOrder.data.total <= 100', nextStepId: 'small-order' },
    ];
    const step = makeStep(branches);
    const contextOverrides: Partial<FlowContext> = {
      steps: {
        fetchOrder: { data: { total: 200 }, completedAt: new Date(), durationMs: 10 },
      },
    };
    const result = await executor.execute(makeInput(step, contextOverrides));
    expect(result.output).toEqual({ nextStepId: 'big-order' });
  });

  it('can evaluate expressions against context.variables', async () => {
    const branches: BranchCase[] = [
      { when: 'variables.env = "prod"', nextStepId: 'prod-step' },
      { when: 'variables.env = "dev"', nextStepId: 'dev-step' },
    ];
    const step = makeStep(branches);
    const contextOverrides: Partial<FlowContext> = {
      variables: { env: 'prod' },
    };
    const result = await executor.execute(makeInput(step, contextOverrides));
    expect(result.output).toEqual({ nextStepId: 'prod-step' });
  });

  it('returns a log entry describing the matched branch', async () => {
    const branches: BranchCase[] = [
      { when: 'trigger.data.status = "approved"', nextStepId: 'approve-step' },
    ];
    const step = makeStep(branches);
    const result = await executor.execute(makeInput(step));

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('approve-step');
  });

  it('returns a non-negative durationMs', async () => {
    const branches: BranchCase[] = [
      { when: 'trigger.data.status = "approved"', nextStepId: 'approve-step' },
    ];
    const step = makeStep(branches);
    const result = await executor.execute(makeInput(step));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not match on truthy-but-not-strictly-true results', async () => {
    // JSONata "trigger.data.status" returns a string, not the boolean true
    const branches: BranchCase[] = [
      { when: 'trigger.data.status', nextStepId: 'some-step' },
    ];
    const step = makeStep(branches);
    // Should throw because result is the string "approved", not exactly true
    await expect(executor.execute(makeInput(step))).rejects.toThrow(BranchResolutionError);
  });
});
