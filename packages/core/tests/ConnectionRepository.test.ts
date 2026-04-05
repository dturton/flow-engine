import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionRepository } from '../src/persistence/ConnectionRepository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

// ── helpers ─────────────────────────────────────────────────────────────────

const TEST_KEY = 'a'.repeat(64); // 32 bytes as hex = 64 hex chars

function makePrismaRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conn-1',
    tenantId: 'tenant-1',
    connectorKey: 'shopify',
    name: 'My Shopify',
    description: null,
    credentials: { accessToken: 'tok123', storeUrl: 'store.myshopify.com' },
    config: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

function makeMockPrisma(
  overrides: Partial<{ connection: Partial<PrismaClient['connection']> }> = {},
): PrismaClient {
  return {
    connection: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      ...overrides.connection,
    },
  } as unknown as PrismaClient;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ConnectionRepository — without encryption key', () => {
  beforeEach(() => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  });

  it('create stores and returns the connection (plaintext)', async () => {
    const row = makePrismaRow();
    const prisma = makeMockPrisma({
      connection: { create: vi.fn().mockResolvedValue(row) },
    });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.create({
      tenantId: 'tenant-1',
      connectorKey: 'shopify',
      name: 'My Shopify',
      credentials: { accessToken: 'tok123', storeUrl: 'store.myshopify.com' },
      config: {},
    });

    expect(result.id).toBe('conn-1');
    expect(result.credentials).toEqual({ accessToken: 'tok123', storeUrl: 'store.myshopify.com' });
    expect(prisma.connection.create).toHaveBeenCalledOnce();
  });

  it('findById returns null when the row does not exist', async () => {
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('findById maps a Prisma row to a Connection', async () => {
    const row = makePrismaRow();
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.findById('conn-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('conn-1');
    expect(result!.tenantId).toBe('tenant-1');
    expect(result!.connectorKey).toBe('shopify');
    expect(result!.name).toBe('My Shopify');
    expect(result!.description).toBeUndefined();
    expect(result!.credentials).toEqual({ accessToken: 'tok123', storeUrl: 'store.myshopify.com' });
  });

  it('findByTenant passes typed where clause to Prisma', async () => {
    const rows = [makePrismaRow()];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = makeMockPrisma({ connection: { findMany } });
    const repo = new ConnectionRepository(prisma);

    await repo.findByTenant('tenant-1', 'shopify');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', connectorKey: 'shopify' },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('findByTenant omits connectorKey filter when not provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makeMockPrisma({ connection: { findMany } });
    const repo = new ConnectionRepository(prisma);

    await repo.findByTenant('tenant-1');

    const { where } = (findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).toEqual({ tenantId: 'tenant-1' });
    expect(where).not.toHaveProperty('connectorKey');
  });

  it('update calls prisma with the supplied fields', async () => {
    const updatedRow = makePrismaRow({ name: 'Renamed' });
    const updateFn = vi.fn().mockResolvedValue(updatedRow);
    const prisma = makeMockPrisma({ connection: { update: updateFn } });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.update('conn-1', { name: 'Renamed' });

    expect(result.name).toBe('Renamed');
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conn-1' } }),
    );
  });

  it('delete calls prisma.connection.delete with the correct id', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ connection: { delete: deleteFn } });
    const repo = new ConnectionRepository(prisma);

    await repo.delete('conn-1');

    expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
  });

  it('description is undefined when the Prisma row has null description', async () => {
    const row = makePrismaRow({ description: null });
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.findById('conn-1');
    expect(result!.description).toBeUndefined();
  });

  it('description is populated when the Prisma row has a non-null description', async () => {
    const row = makePrismaRow({ description: 'A test store' });
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new ConnectionRepository(prisma);

    const result = await repo.findById('conn-1');
    expect(result!.description).toBe('A test store');
  });
});

describe('ConnectionRepository — with encryption key', () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  });

  it('create encrypts credentials before passing them to Prisma', async () => {
    let storedCredentials: unknown = null;
    const row = makePrismaRow();
    const createFn = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      storedCredentials = args.data.credentials;
      return Promise.resolve(row);
    });
    const prisma = makeMockPrisma({ connection: { create: createFn } });
    const repo = new ConnectionRepository(prisma);

    const plaintext = { accessToken: 'shpat_secret', storeUrl: 'store.myshopify.com' };
    await repo.create({
      tenantId: 'tenant-1',
      connectorKey: 'shopify',
      name: 'Secure Store',
      credentials: plaintext,
      config: {},
    });

    // Credentials passed to Prisma must be the encrypted envelope, not plaintext
    expect(storedCredentials).not.toEqual(plaintext);
    expect(storedCredentials).toHaveProperty('_enc');
  });

  it('findById decrypts encrypted credentials transparently', async () => {
    // First, encrypt some credentials via a create call
    let encryptedValue: unknown = null;
    const createFn = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      encryptedValue = args.data.credentials;
      return Promise.resolve(makePrismaRow({ credentials: encryptedValue }));
    });

    const plaintext = { accessToken: 'shpat_secret', storeUrl: 'store.myshopify.com' };

    const prismaForCreate = makeMockPrisma({ connection: { create: createFn } });
    const repoForCreate = new ConnectionRepository(prismaForCreate);
    await repoForCreate.create({
      tenantId: 't',
      connectorKey: 'shopify',
      name: 'n',
      credentials: plaintext,
      config: {},
    });

    // Now read the row back (it contains the encrypted value)
    const prismaForFind = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(makePrismaRow({ credentials: encryptedValue })) },
    });
    const repoForFind = new ConnectionRepository(prismaForFind);
    const result = await repoForFind.findById('conn-1');

    expect(result!.credentials).toEqual(plaintext);
  });

  it('update encrypts new credentials before passing them to Prisma', async () => {
    let storedCredentials: unknown = null;
    const row = makePrismaRow();
    const updateFn = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      storedCredentials = args.data.credentials;
      return Promise.resolve(row);
    });
    const prisma = makeMockPrisma({ connection: { update: updateFn } });
    const repo = new ConnectionRepository(prisma);

    await repo.update('conn-1', { credentials: { accessToken: 'new_secret' } });

    expect(storedCredentials).toHaveProperty('_enc');
    expect(storedCredentials).not.toEqual({ accessToken: 'new_secret' });
  });

  it('throws when encrypted credentials are found but the key is missing', async () => {
    const encryptedRow = makePrismaRow({
      credentials: { _enc: 'fake:deadbeef:deadbeef' },
    });
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(encryptedRow) },
    });
    const repo = new ConnectionRepository(prisma);

    // Remove the key after the repo was created — simulates missing key on read
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;

    await expect(repo.findById('conn-1')).rejects.toThrow(
      'CREDENTIALS_ENCRYPTION_KEY is not set',
    );
  });

  it('rejects a malformed encrypted payload', async () => {
    const malformedRow = makePrismaRow({ credentials: { _enc: 'onlytwoparts:here' } });
    const prisma = makeMockPrisma({
      connection: { findUnique: vi.fn().mockResolvedValue(malformedRow) },
    });
    const repo = new ConnectionRepository(prisma);

    await expect(repo.findById('conn-1')).rejects.toThrow('Malformed encrypted credentials');
  });
});

describe('ConnectionRepository — invalid encryption key', () => {
  afterEach(() => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  });

  it('throws on create when the key is the wrong length', async () => {
    // 63 chars → 31.5 bytes → not 32 bytes
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(62);
    const prisma = makeMockPrisma();
    const repo = new ConnectionRepository(prisma);

    await expect(
      repo.create({ tenantId: 't', connectorKey: 'k', name: 'n', credentials: {}, config: {} }),
    ).rejects.toThrow('64-character hex string');
  });
});
