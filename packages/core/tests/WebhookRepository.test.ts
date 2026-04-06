import { describe, it, expect, vi } from 'vitest';
import { WebhookRepository } from '../src/persistence/WebhookRepository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function makeWebhookRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'wh-1',
    flowId: 'flow-1',
    path: 'abc123',
    secret: 'secret-xyz',
    active: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

function makeMockPrisma(
  overrides: Partial<{ webhook: Record<string, unknown> }> = {},
): PrismaClient {
  return {
    webhook: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      ...overrides.webhook,
    },
  } as unknown as PrismaClient;
}

describe('WebhookRepository', () => {
  it('create stores and returns the webhook', async () => {
    const row = makeWebhookRow();
    const prisma = makeMockPrisma({
      webhook: { create: vi.fn().mockResolvedValue(row) },
    });
    const repo = new WebhookRepository(prisma);

    const result = await repo.create({
      flowId: 'flow-1',
      path: 'abc123',
      secret: 'secret-xyz',
    });

    expect(result.id).toBe('wh-1');
    expect(result.flowId).toBe('flow-1');
    expect(result.path).toBe('abc123');
    expect(result.secret).toBe('secret-xyz');
    expect(result.active).toBe(true);
    expect(prisma.webhook.create).toHaveBeenCalledOnce();
  });

  it('findByFlowId returns webhooks for a given flow', async () => {
    const rows = [makeWebhookRow(), makeWebhookRow({ id: 'wh-2', path: 'def456' })];
    const prisma = makeMockPrisma({
      webhook: { findMany: vi.fn().mockResolvedValue(rows) },
    });
    const repo = new WebhookRepository(prisma);

    const results = await repo.findByFlowId('flow-1');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('wh-1');
    expect(results[1].id).toBe('wh-2');
    expect(prisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flowId: 'flow-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('findByFlowId returns empty array when no webhooks exist', async () => {
    const prisma = makeMockPrisma({
      webhook: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const repo = new WebhookRepository(prisma);

    const results = await repo.findByFlowId('flow-1');
    expect(results).toEqual([]);
  });

  it('findByPath returns the webhook when it exists', async () => {
    const row = makeWebhookRow();
    const prisma = makeMockPrisma({
      webhook: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new WebhookRepository(prisma);

    const result = await repo.findByPath('abc123');

    expect(result).not.toBeNull();
    expect(result!.path).toBe('abc123');
    expect(prisma.webhook.findUnique).toHaveBeenCalledWith({ where: { path: 'abc123' } });
  });

  it('findByPath returns null when the webhook does not exist', async () => {
    const prisma = makeMockPrisma({
      webhook: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const repo = new WebhookRepository(prisma);

    const result = await repo.findByPath('nonexistent');
    expect(result).toBeNull();
  });

  it('delete calls prisma.webhook.delete with the correct id', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({
      webhook: { delete: deleteFn },
    });
    const repo = new WebhookRepository(prisma);

    await repo.delete('wh-1');

    expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
  });

  it('maps all Prisma row fields to the Webhook interface', async () => {
    const createdAt = new Date('2025-06-01');
    const updatedAt = new Date('2025-06-02');
    const row = makeWebhookRow({
      id: 'wh-custom',
      flowId: 'flow-custom',
      path: 'custom-path',
      secret: 'custom-secret',
      active: false,
      createdAt,
      updatedAt,
    });
    const prisma = makeMockPrisma({
      webhook: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new WebhookRepository(prisma);

    const result = await repo.findByPath('custom-path');

    expect(result).toEqual({
      id: 'wh-custom',
      flowId: 'flow-custom',
      path: 'custom-path',
      secret: 'custom-secret',
      active: false,
      createdAt,
      updatedAt,
    });
  });
});
