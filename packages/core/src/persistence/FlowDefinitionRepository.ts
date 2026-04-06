/**
 * Persistence layer for flow definitions. Wraps Prisma CRUD operations and
 * converts between the Prisma row format and the domain {@link FlowDefinition} type.
 * Automatically increments the version on each update.
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { FlowDefinition } from '../types/flow.js';

/** Repository for creating, reading, updating, and deleting flow definitions. */
export class FlowDefinitionRepository {
  constructor(private prisma: PrismaClient) {}

  async create(flow: Omit<FlowDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<FlowDefinition> {
    const row = await this.prisma.flowDefinition.create({
      data: {
        name: flow.name,
        description: flow.description ?? null,
        tenantId: flow.tenantId,
        steps: flow.steps as unknown as Prisma.InputJsonValue,
        errorPolicy: flow.errorPolicy as unknown as Prisma.InputJsonValue,
        tags: flow.tags ?? [],
      },
    });
    return this.toFlowDefinition(row);
  }

  async update(id: string, data: Partial<Pick<FlowDefinition, 'name' | 'description' | 'steps' | 'errorPolicy' | 'tags'>>): Promise<FlowDefinition> {
    const existing = await this.prisma.flowDefinition.findUnique({ where: { id } });
    if (!existing) throw new Error(`Flow not found: ${id}`);

    const row = await this.prisma.flowDefinition.update({
      where: { id },
      data: {
        ...data.name !== undefined && { name: data.name },
        ...data.description !== undefined && { description: data.description },
        ...data.steps !== undefined && { steps: data.steps as unknown as Prisma.InputJsonValue },
        ...data.errorPolicy !== undefined && { errorPolicy: data.errorPolicy as unknown as Prisma.InputJsonValue },
        ...data.tags !== undefined && { tags: data.tags },
        version: existing.version + 1,
      },
    });
    return this.toFlowDefinition(row);
  }

  async findById(id: string): Promise<FlowDefinition | null> {
    const row = await this.prisma.flowDefinition.findUnique({ where: { id } });
    if (!row) return null;
    return this.toFlowDefinition(row);
  }

  async findAll(opts?: { tenantId?: string; tag?: string; limit?: number }): Promise<FlowDefinition[]> {
    const where: Record<string, unknown> = {};
    if (opts?.tenantId) where.tenantId = opts.tenantId;
    if (opts?.tag) where.tags = { has: opts.tag };

    const rows = await this.prisma.flowDefinition.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: opts?.limit ?? 100,
    });
    return rows.map((r) => this.toFlowDefinition(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.flowDefinition.delete({ where: { id } });
  }

  private toFlowDefinition(row: Record<string, unknown>): FlowDefinition {
    return {
      id: row.id as string,
      version: row.version as number,
      name: row.name as string,
      description: row.description as string | undefined,
      tenantId: row.tenantId as string,
      steps: row.steps as FlowDefinition['steps'],
      errorPolicy: row.errorPolicy as FlowDefinition['errorPolicy'],
      tags: row.tags as string[],
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  }
}
