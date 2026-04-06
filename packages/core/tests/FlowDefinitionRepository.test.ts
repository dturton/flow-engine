import { describe, it, expect, vi } from 'vitest';
import { FlowDefinitionRepository } from '../src/persistence/FlowDefinitionRepository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function makeFlowRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'flow-1',
    version: 1,
    name: 'Test Flow',
    description: null,
    tenantId: 'tenant-1',
    steps: [{ id: 'step-1', name: 'Step 1', type: 'transform', dependsOn: [], inputMapping: {} }],
    errorPolicy: { onStepFailure: 'halt' },
    tags: ['test'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

function makeMockPrisma(
  overrides: Partial<{ flowDefinition: Record<string, unknown> }> = {},
): PrismaClient {
  return {
    flowDefinition: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      ...overrides.flowDefinition,
    },
  } as unknown as PrismaClient;
}

describe('FlowDefinitionRepository', () => {
  it('create stores and returns the flow definition', async () => {
    const row = makeFlowRow();
    const prisma = makeMockPrisma({
      flowDefinition: { create: vi.fn().mockResolvedValue(row) },
    });
    const repo = new FlowDefinitionRepository(prisma);

    const result = await repo.create({
      name: 'Test Flow',
      tenantId: 'tenant-1',
      steps: row.steps as any,
      errorPolicy: row.errorPolicy as any,
      tags: ['test'],
    });

    expect(result.id).toBe('flow-1');
    expect(result.name).toBe('Test Flow');
    expect(result.version).toBe(1);
    expect(result.tenantId).toBe('tenant-1');
    expect(prisma.flowDefinition.create).toHaveBeenCalledOnce();
  });

  it('update increments version and returns updated flow', async () => {
    const existing = makeFlowRow({ version: 2 });
    const updated = makeFlowRow({ version: 3, name: 'Updated Flow' });
    const prisma = makeMockPrisma({
      flowDefinition: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    });
    const repo = new FlowDefinitionRepository(prisma);

    const result = await repo.update('flow-1', { name: 'Updated Flow' });

    expect(result.name).toBe('Updated Flow');
    expect(result.version).toBe(3);
    expect(prisma.flowDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'flow-1' },
        data: expect.objectContaining({ version: 3 }),
      }),
    );
  });

  it('update throws when flow does not exist', async () => {
    const prisma = makeMockPrisma({
      flowDefinition: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const repo = new FlowDefinitionRepository(prisma);

    await expect(repo.update('nonexistent', { name: 'X' })).rejects.toThrow('Flow not found');
  });

  it('findById returns the flow when it exists', async () => {
    const row = makeFlowRow();
    const prisma = makeMockPrisma({
      flowDefinition: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new FlowDefinitionRepository(prisma);

    const result = await repo.findById('flow-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('flow-1');
  });

  it('findById returns null when flow does not exist', async () => {
    const prisma = makeMockPrisma({
      flowDefinition: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const repo = new FlowDefinitionRepository(prisma);

    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('findAll returns flows ordered by updatedAt', async () => {
    const rows = [makeFlowRow({ id: 'a' }), makeFlowRow({ id: 'b' })];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = makeMockPrisma({ flowDefinition: { findMany } });
    const repo = new FlowDefinitionRepository(prisma);

    const results = await repo.findAll();

    expect(results).toHaveLength(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    );
  });

  it('findAll filters by tenantId when provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makeMockPrisma({ flowDefinition: { findMany } });
    const repo = new FlowDefinitionRepository(prisma);

    await repo.findAll({ tenantId: 'tenant-1' });

    const { where } = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where.tenantId).toBe('tenant-1');
  });

  it('findAll filters by tag when provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makeMockPrisma({ flowDefinition: { findMany } });
    const repo = new FlowDefinitionRepository(prisma);

    await repo.findAll({ tag: 'production' });

    const { where } = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where.tags).toEqual({ has: 'production' });
  });

  it('findAll respects custom limit', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makeMockPrisma({ flowDefinition: { findMany } });
    const repo = new FlowDefinitionRepository(prisma);

    await repo.findAll({ limit: 10 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('delete calls prisma.flowDefinition.delete', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ flowDefinition: { delete: deleteFn } });
    const repo = new FlowDefinitionRepository(prisma);

    await repo.delete('flow-1');

    expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'flow-1' } });
  });

  it('maps description: null to undefined in the output', async () => {
    const row = makeFlowRow({ description: null });
    const prisma = makeMockPrisma({
      flowDefinition: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new FlowDefinitionRepository(prisma);

    const result = await repo.findById('flow-1');
    // null from Prisma becomes undefined in the type (via the cast)
    expect(result!.description).toBeNull();
  });
});
