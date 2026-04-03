import { describe, it, expect, vi } from 'vitest';
import { StepExecutorRegistry, InputResolver } from '../src/engine/StepExecutor.js';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../src/engine/StepExecutor.js';
import type { StepDefinition } from '../src/types/flow.js';
import type { FlowContext } from '../src/types/run.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeExecutor(type: StepDefinition['type']): StepExecutor {
  return {
    type,
    execute: vi.fn<[StepExecutionInput], Promise<StepExecutionResult>>().mockResolvedValue({
      output: { done: true },
      logs: [],
      durationMs: 1,
    }),
  };
}

function makeContext(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    runId: 'run-1',
    flowId: 'flow-1',
    trigger: {
      type: 'manual',
      data: { orderId: 'ORD-42', amount: 99.5 },
      receivedAt: new Date(),
    },
    steps: {
      stepA: { data: { result: 'hello' }, completedAt: new Date(), durationMs: 10 },
    },
    variables: { env: 'production', threshold: 50 },
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: 'step-1',
    name: 'Test Step',
    type: 'action',
    inputMapping: {},
    dependsOn: [],
    ...overrides,
  };
}

// ─── StepExecutorRegistry ─────────────────────────────────────────────────────

describe('StepExecutorRegistry', () => {
  it('registers an executor and retrieves it by type', () => {
    const registry = new StepExecutorRegistry();
    const executor = makeExecutor('action');

    registry.register(executor);

    expect(registry.get('action')).toBe(executor);
  });

  it('throws when no executor is registered for a type', () => {
    const registry = new StepExecutorRegistry();
    expect(() => registry.get('transform')).toThrow('No executor registered for step type: transform');
  });

  it('overwrites an existing executor when re-registering the same type', () => {
    const registry = new StepExecutorRegistry();
    const executorA = makeExecutor('action');
    const executorB = makeExecutor('action');

    registry.register(executorA);
    registry.register(executorB);

    expect(registry.get('action')).toBe(executorB);
  });

  it('delegates execute() to the registered executor', async () => {
    const registry = new StepExecutorRegistry();
    const executor = makeExecutor('transform');
    registry.register(executor);

    const input: StepExecutionInput = {
      step: makeStep({ type: 'transform' }),
      resolvedInputs: {},
      context: makeContext(),
      attempt: 1,
    };

    const result = await registry.execute('transform', input);

    expect(executor.execute).toHaveBeenCalledWith(input);
    expect(result.output).toEqual({ done: true });
  });

  it('throws when execute() is called for an unregistered type', async () => {
    const registry = new StepExecutorRegistry();
    const input: StepExecutionInput = {
      step: makeStep({ type: 'script' }),
      resolvedInputs: {},
      context: makeContext(),
      attempt: 1,
    };
    // get() throws synchronously, which causes execute() to throw synchronously too
    expect(() => registry.execute('script', input)).toThrow('No executor registered for step type: script');
  });
});

// ─── InputResolver ────────────────────────────────────────────────────────────

describe('InputResolver', () => {
  const resolver = new InputResolver();

  describe('string shorthand', () => {
    it('returns the raw string when the mapping value is a plain string', async () => {
      const context = makeContext();
      const result = await resolver.resolve({ greeting: 'hello' }, context);
      expect(result.greeting).toBe('hello');
    });
  });

  describe('literal expressions', () => {
    it('returns the literal value', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { count: { type: 'literal', value: '42' } },
        context
      );
      expect(result.count).toBe('42');
    });

    it('returns literal value independent of context', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { flag: { type: 'literal', value: 'true' } },
        context
      );
      expect(result.flag).toBe('true');
    });
  });

  describe('jsonpath expressions', () => {
    it('extracts a value from context using a JSONPath expression', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { orderId: { type: 'jsonpath', value: '$.trigger.data.orderId' } },
        context
      );
      expect(result.orderId).toBe('ORD-42');
    });

    it('returns the single item (not an array) when exactly one value matches', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { env: { type: 'jsonpath', value: '$.variables.env' } },
        context
      );
      expect(result.env).toBe('production');
    });

    it('returns an array when multiple values match', async () => {
      const context = makeContext({
        trigger: {
          type: 'manual',
          data: { tags: ['a', 'b', 'c'] },
          receivedAt: new Date(),
        },
      });
      const result = await resolver.resolve(
        { tags: { type: 'jsonpath', value: '$.trigger.data.tags.*' } },
        context
      );
      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('extracts a value from a prior step output', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { prevResult: { type: 'jsonpath', value: '$.steps.stepA.data.result' } },
        context
      );
      expect(result.prevResult).toBe('hello');
    });
  });

  describe('jsonata expressions', () => {
    it('evaluates a JSONata expression against the context', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { doubled: { type: 'jsonata', value: 'trigger.data.amount * 2' } },
        context
      );
      expect(result.doubled).toBe(199);
    });

    it('evaluates string concatenation via JSONata', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { greeting: { type: 'jsonata', value: '"Hello, " & variables.env' } },
        context
      );
      expect(result.greeting).toBe('Hello, production');
    });

    it('returns a boolean result from a JSONata comparison', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { isExpensive: { type: 'jsonata', value: 'trigger.data.amount > variables.threshold' } },
        context
      );
      expect(result.isExpensive).toBe(true);
    });
  });

  describe('template expressions', () => {
    it('interpolates a single placeholder', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { msg: { type: 'template', value: 'Order {{trigger.data.orderId}} received' } },
        context
      );
      expect(result.msg).toBe('Order ORD-42 received');
    });

    it('interpolates multiple placeholders', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { msg: { type: 'template', value: 'Env: {{variables.env}}, Threshold: {{variables.threshold}}' } },
        context
      );
      expect(result.msg).toBe('Env: production, Threshold: 50');
    });

    it('replaces missing path with empty string', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { msg: { type: 'template', value: 'Hi {{trigger.data.nonExistent}}!' } },
        context
      );
      expect(result.msg).toBe('Hi !');
    });

    it('returns the template as-is when there are no placeholders', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { msg: { type: 'template', value: 'static text' } },
        context
      );
      expect(result.msg).toBe('static text');
    });

    it('accesses nested step output via template', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        { val: { type: 'template', value: 'result={{steps.stepA.data.result}}' } },
        context
      );
      expect(result.val).toBe('result=hello');
    });
  });

  describe('mixed mappings', () => {
    it('resolves a mapping with multiple keys of different expression types', async () => {
      const context = makeContext();
      const result = await resolver.resolve(
        {
          staticVal: 'raw-string',
          literalVal: { type: 'literal', value: 'lit' },
          jsonpathVal: { type: 'jsonpath', value: '$.variables.env' },
          jsonataVal: { type: 'jsonata', value: 'trigger.data.amount' },
          templateVal: { type: 'template', value: 'id={{trigger.data.orderId}}' },
        },
        context
      );
      expect(result.staticVal).toBe('raw-string');
      expect(result.literalVal).toBe('lit');
      expect(result.jsonpathVal).toBe('production');
      expect(result.jsonataVal).toBe(99.5);
      expect(result.templateVal).toBe('id=ORD-42');
    });
  });

  describe('unknown expression type', () => {
    it('throws for an unknown expression type', async () => {
      const context = makeContext();
      await expect(
        resolver.resolve(
          { x: { type: 'unknown' as never, value: 'v' } },
          context
        )
      ).rejects.toThrow('Unknown expression type: unknown');
    });
  });
});
