import { describe, it, expect, vi } from 'vitest';
import {
  ActionExecutor,
  ConnectorRegistry,
  type ConnectionResolver,
} from '../../src/executors/ActionExecutor.js';
import { ConnectorNotFoundError } from '../../src/errors.js';
import type { Connector } from '../../src/executors/ActionExecutor.js';
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

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: 'action-1',
    name: 'Action Step',
    type: 'action',
    inputMapping: {},
    dependsOn: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<StepExecutionInput> = {}): StepExecutionInput {
  return {
    step: makeStep(),
    resolvedInputs: {},
    context: makeContext(),
    attempt: 1,
    ...overrides,
  };
}

describe('ConnectorRegistry', () => {
  it('registers and retrieves a connector by key', () => {
    const registry = new ConnectorRegistry();
    const connector: Connector = { execute: vi.fn() };

    registry.register('http', connector);

    expect(registry.get('http')).toBe(connector);
  });

  it('returns undefined for an unregistered key', () => {
    const registry = new ConnectorRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('overwrites an existing connector when re-registering the same key', () => {
    const registry = new ConnectorRegistry();
    const connectorA: Connector = { execute: vi.fn() };
    const connectorB: Connector = { execute: vi.fn() };

    registry.register('http', connectorA);
    registry.register('http', connectorB);

    expect(registry.get('http')).toBe(connectorB);
  });
});

describe('ActionExecutor', () => {
  it('has type "action"', () => {
    const registry = new ConnectorRegistry();
    const executor = new ActionExecutor(registry);
    expect(executor.type).toBe('action');
  });

  it('throws ConnectorNotFoundError when step has no connectorKey', async () => {
    const registry = new ConnectorRegistry();
    const executor = new ActionExecutor(registry);
    const input = makeInput({ step: makeStep({ connectorKey: undefined }) });

    await expect(executor.execute(input)).rejects.toThrow(ConnectorNotFoundError);
    await expect(executor.execute(input)).rejects.toThrow('has no connectorKey');
  });

  it('throws ConnectorNotFoundError when connector is not registered', async () => {
    const registry = new ConnectorRegistry();
    const executor = new ActionExecutor(registry);
    const input = makeInput({ step: makeStep({ connectorKey: 'missing-connector' }) });

    await expect(executor.execute(input)).rejects.toThrow(ConnectorNotFoundError);
    await expect(executor.execute(input)).rejects.toThrow('missing-connector');
  });

  it('executes connector with the given operationId and returns its output', async () => {
    const registry = new ConnectorRegistry();
    const connector: Connector = {
      execute: vi.fn().mockResolvedValue({ userId: 42 }),
    };
    registry.register('my-service', connector);

    const executor = new ActionExecutor(registry);
    const resolvedInputs = { email: 'test@example.com' };
    const input = makeInput({
      step: makeStep({ connectorKey: 'my-service', operationId: 'getUser' }),
      resolvedInputs,
    });

    const result = await executor.execute(input);

    expect(connector.execute).toHaveBeenCalledWith('getUser', resolvedInputs);
    expect(result.output).toEqual({ userId: 42 });
  });

  it('falls back to "default" operationId when operationId is not set', async () => {
    const registry = new ConnectorRegistry();
    const connector: Connector = {
      execute: vi.fn().mockResolvedValue({ ok: true }),
    };
    registry.register('my-service', connector);

    const executor = new ActionExecutor(registry);
    const input = makeInput({
      step: makeStep({ connectorKey: 'my-service', operationId: undefined }),
    });

    await executor.execute(input);

    expect(connector.execute).toHaveBeenCalledWith('default', expect.anything());
  });

  it('returns a log entry containing connectorKey and operationId', async () => {
    const registry = new ConnectorRegistry();
    registry.register('svc', {
      execute: vi.fn().mockResolvedValue({}),
    });

    const executor = new ActionExecutor(registry);
    const input = makeInput({
      step: makeStep({ connectorKey: 'svc', operationId: 'doIt' }),
    });

    const result = await executor.execute(input);

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].level).toBe('info');
    expect(result.logs[0].message).toContain('svc.doIt');
    expect(result.logs[0].meta).toMatchObject({ connectorKey: 'svc', operationId: 'doIt' });
  });

  it('returns a positive durationMs', async () => {
    const registry = new ConnectorRegistry();
    registry.register('svc', { execute: vi.fn().mockResolvedValue({}) });

    const executor = new ActionExecutor(registry);
    const result = await executor.execute(
      makeInput({ step: makeStep({ connectorKey: 'svc' }) })
    );

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('propagates errors thrown by the connector', async () => {
    const registry = new ConnectorRegistry();
    registry.register('svc', {
      execute: vi.fn().mockRejectedValue(new Error('network failure')),
    });

    const executor = new ActionExecutor(registry);
    await expect(
      executor.execute(makeInput({ step: makeStep({ connectorKey: 'svc' }) }))
    ).rejects.toThrow('network failure');
  });
});

describe('ActionExecutor — connectionId resolution', () => {
  it('resolves the connector via connectionResolver when step has a connectionId', async () => {
    const registry = new ConnectorRegistry();
    const dynamicConnector: Connector = {
      execute: vi.fn().mockResolvedValue({ result: 'ok' }),
    };
    const resolver: ConnectionResolver = {
      resolve: vi.fn().mockResolvedValue(dynamicConnector),
    };

    const executor = new ActionExecutor(registry, resolver);
    const input = makeInput({
      step: makeStep({ connectorKey: 'shopify', connectionId: 'conn-1', operationId: 'listProducts' }),
    });

    const result = await executor.execute(input);

    expect(resolver.resolve).toHaveBeenCalledWith('conn-1');
    expect(dynamicConnector.execute).toHaveBeenCalledWith('listProducts', expect.anything());
    expect(result.output).toEqual({ result: 'ok' });
  });

  it('prefers connectionId over connectorRegistry when both are available', async () => {
    const registryConnector: Connector = { execute: vi.fn().mockResolvedValue({ from: 'registry' }) };
    const dynamicConnector: Connector = { execute: vi.fn().mockResolvedValue({ from: 'resolver' }) };

    const registry = new ConnectorRegistry();
    registry.register('shopify', registryConnector);

    const resolver: ConnectionResolver = {
      resolve: vi.fn().mockResolvedValue(dynamicConnector),
    };

    const executor = new ActionExecutor(registry, resolver);
    const result = await executor.execute(
      makeInput({ step: makeStep({ connectorKey: 'shopify', connectionId: 'conn-1' }) }),
    );

    expect(registryConnector.execute).not.toHaveBeenCalled();
    expect(result.output).toEqual({ from: 'resolver' });
  });

  it('throws ConnectorNotFoundError when connectionId is set but no resolver is configured', async () => {
    const registry = new ConnectorRegistry();
    const executor = new ActionExecutor(registry); // no resolver

    const input = makeInput({
      step: makeStep({ connectorKey: 'shopify', connectionId: 'conn-1' }),
    });

    await expect(executor.execute(input)).rejects.toThrow(ConnectorNotFoundError);
    await expect(executor.execute(input)).rejects.toThrow(
      'no ConnectionResolver is configured',
    );
  });

  it('propagates errors thrown by the connectionResolver', async () => {
    const registry = new ConnectorRegistry();
    const resolver: ConnectionResolver = {
      resolve: vi.fn().mockRejectedValue(new Error('Connection not found: "conn-99"')),
    };

    const executor = new ActionExecutor(registry, resolver);
    const input = makeInput({
      step: makeStep({ connectorKey: 'shopify', connectionId: 'conn-99' }),
    });

    await expect(executor.execute(input)).rejects.toThrow('Connection not found: "conn-99"');
  });

  it('does not use connectionResolver when connectionId is absent', async () => {
    const registry = new ConnectorRegistry();
    const connector: Connector = { execute: vi.fn().mockResolvedValue({}) };
    registry.register('http', connector);

    const resolver: ConnectionResolver = { resolve: vi.fn() };
    const executor = new ActionExecutor(registry, resolver);

    await executor.execute(
      makeInput({ step: makeStep({ connectorKey: 'http' }) }),
    );

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(connector.execute).toHaveBeenCalledOnce();
  });
});
