import type { PrismaClient, Prisma } from '@prisma/client';
import type { FlowRun, FlowRunStatus, StepRun } from '../types/run.js';

export class FlowRunRepository {
  constructor(private prisma: PrismaClient) {}

  async create(run: FlowRun): Promise<void> {
    await this.prisma.flowRun.create({
      data: {
        id: run.id,
        flowId: run.flowId,
        flowVersion: run.flowVersion,
        tenantId: run.tenantId,
        status: run.status,
        trigger: run.trigger as unknown as Prisma.InputJsonValue,
        startedAt: run.startedAt,
        completedAt: run.completedAt ?? null,
        error: run.error as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateStatus(runId: string, status: FlowRunStatus, completedAt?: Date): Promise<void> {
    await this.prisma.flowRun.update({
      where: { id: runId },
      data: {
        status,
        ...(completedAt ? { completedAt } : {}),
      },
    });
  }

  async upsertStepRun(runId: string, stepRun: StepRun): Promise<void> {
    const shared = {
      status: stepRun.status,
      attempt: stepRun.attempt,
      startedAt: stepRun.startedAt ?? null,
      completedAt: stepRun.completedAt ?? null,
      durationMs: stepRun.durationMs ?? null,
      input: stepRun.input as unknown as Prisma.InputJsonValue,
      output: stepRun.output as unknown as Prisma.InputJsonValue | undefined,
      error: stepRun.error as unknown as Prisma.InputJsonValue | undefined,
      logs: stepRun.logs as unknown as Prisma.InputJsonValue,
    };

    await this.prisma.stepRun.upsert({
      where: {
        flowRunId_stepId: {
          flowRunId: runId,
          stepId: stepRun.stepId,
        },
      },
      create: {
        flowRunId: runId,
        stepId: stepRun.stepId,
        ...shared,
      },
      update: shared,
    });
  }

  async findById(runId: string): Promise<FlowRun | null> {
    const row = await this.prisma.flowRun.findUnique({
      where: { id: runId },
      include: { stepRuns: true },
    });

    if (!row) return null;
    return this.toFlowRun(row);
  }

  async findByFlowId(flowId: string, limit = 50): Promise<FlowRun[]> {
    const rows = await this.prisma.flowRun.findMany({
      where: { flowId },
      include: { stepRuns: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => this.toFlowRun(row));
  }

  private toFlowRun(row: Record<string, unknown>): FlowRun {
    const stepRunRows = (row.stepRuns ?? []) as Array<Record<string, unknown>>;
    const stepRuns: Record<string, StepRun> = {};

    for (const sr of stepRunRows) {
      stepRuns[sr.stepId as string] = {
        stepId: sr.stepId as string,
        status: sr.status as StepRun['status'],
        attempt: sr.attempt as number,
        startedAt: sr.startedAt as Date | undefined,
        completedAt: sr.completedAt as Date | undefined,
        durationMs: sr.durationMs as number | undefined,
        input: sr.input as Record<string, unknown>,
        output: sr.output as Record<string, unknown> | undefined,
        error: sr.error as StepRun['error'],
        logs: sr.logs as StepRun['logs'],
      };
    }

    return {
      id: row.id as string,
      flowId: row.flowId as string,
      flowVersion: row.flowVersion as number,
      tenantId: row.tenantId as string,
      status: row.status as FlowRun['status'],
      trigger: row.trigger as FlowRun['trigger'],
      startedAt: row.startedAt as Date,
      completedAt: row.completedAt as Date | undefined,
      stepRuns,
      error: row.error as FlowRun['error'],
    };
  }
}
