import { describe, it, expect, vi } from 'vitest';
import { ConnectorFactory } from '../src/base/ConnectorFactory.js';
import type { Connector } from '../src/base/types.js';
import type { Connection } from '@flow-engine/core';

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'conn-1',
    tenantId: 'tenant-1',
    connectorKey: 'shopify',
    name: 'Test Connection',
    credentials: { accessToken: 'tok', storeUrl: 'store.myshopify.com' },
    config: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ConnectorFactory', () => {
  it('creates a connector using the registered builder', () => {
    const factory = new ConnectorFactory();
    const fakeConnector: Connector = { execute: vi.fn() };
    factory.registerBuilder('shopify', () => fakeConnector);

    const conn = makeConnection({ connectorKey: 'shopify' });
    expect(factory.create(conn)).toBe(fakeConnector);
  });

  it('passes the Connection record to the builder', () => {
    const factory = new ConnectorFactory();
    const builder = vi.fn().mockReturnValue({ execute: vi.fn() });
    factory.registerBuilder('shopify', builder);

    const conn = makeConnection();
    factory.create(conn);

    expect(builder).toHaveBeenCalledWith(conn);
  });

  it('throws when no builder is registered for the connectorKey', () => {
    const factory = new ConnectorFactory();
    const conn = makeConnection({ connectorKey: 'unknown' });

    expect(() => factory.create(conn)).toThrow('No builder registered for connector key "unknown"');
  });

  it('lists available connector keys in the error message', () => {
    const factory = new ConnectorFactory();
    factory.registerBuilder('shopify', () => ({ execute: vi.fn() }));
    factory.registerBuilder('http', () => ({ execute: vi.fn() }));

    const conn = makeConnection({ connectorKey: 'stripe' });

    expect(() => factory.create(conn)).toThrow(/shopify/);
    expect(() => factory.create(conn)).toThrow(/http/);
  });

  it('has() returns true for a registered key', () => {
    const factory = new ConnectorFactory();
    factory.registerBuilder('shopify', () => ({ execute: vi.fn() }));
    expect(factory.has('shopify')).toBe(true);
  });

  it('has() returns false for an unregistered key', () => {
    const factory = new ConnectorFactory();
    expect(factory.has('missing')).toBe(false);
  });

  it('overwrites an existing builder when the same key is re-registered', () => {
    const factory = new ConnectorFactory();
    const connA: Connector = { execute: vi.fn() };
    const connB: Connector = { execute: vi.fn() };
    factory.registerBuilder('shopify', () => connA);
    factory.registerBuilder('shopify', () => connB);

    const conn = makeConnection();
    expect(factory.create(conn)).toBe(connB);
  });
});
