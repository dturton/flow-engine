import { describe, it, expect, vi } from 'vitest';
import { FlowRunRepository } from '../src/persistence/FlowRunRepository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { FlowRun, StepRun } from '../src/types/run.js';

function makeFlowRun(): FlowRun {
  return {
    id: 'run-1',
    flowId: 'flow-1',
    flowVersion: 1,
    tenantId: 'tenant-1',
    status: 'queued',
    trigger: { type: 'manual', data: {}, receivedAt: new Date() },
    startedAt: new Date('2024-01-01'),
    stepRuns: {},
  };
}

function makeStepRun(): StepRun {
  return {
    stepId: 'step-1',
    status: 'completed',
    attempt: 1,
    startedAt: new Date('2024-01-01T00:00:01'),
    completedAt: new Date('2024-01-01T00:00:02'),
    durationMs: 1000,
    input: { key: 'value' },
    output: { result: 42 },
    logs: [{ level: 'info', message: 'done', timestamp: new Date() }],
  };
}

function makePrismaRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'run-1',
    flowId: 'flow-1',
    flowVersion: 1,
    tenantId: 'tenant-1',
    status: 'completed',
    trigger: { type: 'manual', data: {}, receivedAt: '2024-01-01' },
    startedAt: new Date('2024-01-01'),
    completedAt: new Date('2024-01-01T01:00:00'),
    error: null,
    stepRuns: [
      {
        stepId: 'step-1',
        status: 'completed',
        attempt: 1,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 100,
        input: {},
        output: { result: 1 },
        error: null,
        logs: [],
      },
    ],
    ...overrides,
  };
}

function makeMockPrisma(
  overrides: Partial<{ flowRun: Record<string, unknown>; stepRun: Record<string, unknown> }> = {},
): PrismaClient {
  return {
    flowRun: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      ...overrides.flowRun,
    },
    stepRun: {
      upsert: vi.fn(),
      ...overrides.stepRun,
    },
  } as unknown as PrismaClient;
}

describe('FlowRunRepository', () => {
  it('create persists a flow run', async () => {
    const createFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ flowRun: { create: createFn } });
    const repo = new FlowRunRepository(prisma);
    const run = makeFlowRun();

    await repo.create(run);

    expect(createFn).toHaveBeenCalledOnce();
    const data = createFn.mock.calls[0][0].data;
    expect(data.id).toBe('run-1');
    expect(data.flowId).toBe('flow-1');
    expect(data.status).toBe('queued');
  });

  it('updateStatus updates status and optional completedAt', async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ flowRun: { update: updateFn } });
    const repo = new FlowRunRepository(prisma);
    const completedAt = new Date();

    await repo.updateStatus('run-1', 'completed', completedAt);

    expect(updateFn).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'completed', completedAt },
    });
  });

  it('updateStatus without completedAt does not include it in data', async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ flowRun: { update: updateFn } });
    const repo = new FlowRunRepository(prisma);

    await repo.updateStatus('run-1', 'running');

    const { data } = updateFn.mock.calls[0][0];
    expect(data.status).toBe('running');
    expect(data).not.toHaveProperty('completedAt');
  });

  it('upsertStepRun upserts with the correct composite key', async () => {
    const upsertFn = vi.fn().mockResolvedValue(undefined);
    const prisma = makeMockPrisma({ stepRun: { upsert: upsertFn } });
    const repo = new FlowRunRepository(prisma);
    const stepRun = makeStepRun();

    await repo.upsertStepRun('run-1', stepRun);

    expect(upsertFn).toHaveBeenCalledOnce();
    const args = upsertFn.mock.calls[0][0];
    expect(args.where.flowRunId_stepId).toEqual({
      flowRunId: 'run-1',
      stepId: 'step-1',
    });
    expect(args.create.flowRunId).toBe('run-1');
    expect(args.create.stepId).toBe('step-1');
    expect(args.create.status).toBe('completed');
    expect(args.update.status).toBe('completed');
  });

  it('findById returns the run with step runs mapped by stepId', async () => {
    const row = makePrismaRunRow();
    const prisma = makeMockPrisma({
      flowRun: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new FlowRunRepository(prisma);

    const result = await repo.findById('run-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('run-1');
    expect(result!.status).toBe('completed');
    expect(result!.stepRuns['step-1']).toBeDefined();
    expect(result!.stepRuns['step-1'].status).toBe('completed');
  });

  it('findById returns null when run does not exist', async () => {
    const prisma = makeMockPrisma({
      flowRun: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const repo = new FlowRunRepository(prisma);

    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('findById maps multiple step runs keyed by stepId', async () => {
    const row = makePrismaRunRow({
      stepRuns: [
        { stepId: 'A', status: 'completed', attempt: 1, startedAt: null, completedAt: null, durationMs: null, input: {}, output: {}, error: null, logs: [] },
        { stepId: 'B', status: 'failed', attempt: 2, startedAt: null, completedAt: null, durationMs: null, input: {}, output: null, error: { code: 'ERR', message: 'fail', category: 'unknown', retryable: false }, logs: [] },
      ],
    });
    const prisma = makeMockPrisma({
      flowRun: { findUnique: vi.fn().mockResolvedValue(row) },
    });
    const repo = new FlowRunRepository(prisma);

    const result = await repo.findById('run-1');

    expect(Object.keys(result!.stepRuns)).toEqual(['A', 'B']);
    expect(result!.stepRuns['A'].status).toBe('completed');
    expect(result!.stepRuns['B'].status).toBe('failed');
    expect(result!.stepRuns['B'].attempt).toBe(2);
  });

  it('findByFlowId returns runs for a flow', async () => {
    const rows = [makePrismaRunRow({ id: 'run-1' }), makePrismaRunRow({ id: 'run-2' })];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = makeMockPrisma({ flowRun: { findMany } });
    const repo = new FlowRunRepository(prisma);

    const results = await repo.findByFlowId('flow-1');

    expect(results).toHaveLength(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flowId: 'flow-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  });

  it('findByFlowId respects custom limit', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makeMockPrisma({ flowRun: { findMany } });
    const repo = new FlowRunRepository(prisma);

    await repo.findByFlowId('flow-1', 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });
});
