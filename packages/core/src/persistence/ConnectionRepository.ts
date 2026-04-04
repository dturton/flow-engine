import type { PrismaClient, Prisma } from '@prisma/client';

export interface Connection {
  id: string;
  tenantId: string;
  connectorKey: string;
  name: string;
  description?: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class ConnectionRepository {
  constructor(private prisma: PrismaClient) {}

  async create(
    data: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Connection> {
    const row = await this.prisma.connection.create({
      data: {
        tenantId: data.tenantId,
        connectorKey: data.connectorKey,
        name: data.name,
        description: data.description ?? null,
        credentials: data.credentials as Prisma.InputJsonValue,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toConnection(row);
  }

  async update(
    id: string,
    data: Partial<Pick<Connection, 'name' | 'description' | 'credentials' | 'config'>>,
  ): Promise<Connection> {
    const row = await this.prisma.connection.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.credentials !== undefined && { credentials: data.credentials as Prisma.InputJsonValue }),
        ...(data.config !== undefined && { config: data.config as Prisma.InputJsonValue }),
      },
    });
    return this.toConnection(row);
  }

  async findById(id: string): Promise<Connection | null> {
    const row = await this.prisma.connection.findUnique({ where: { id } });
    if (!row) return null;
    return this.toConnection(row);
  }

  async findByTenant(tenantId: string, connectorKey?: string): Promise<Connection[]> {
    const where: Record<string, unknown> = { tenantId };
    if (connectorKey) where.connectorKey = connectorKey;

    const rows = await this.prisma.connection.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toConnection(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.connection.delete({ where: { id } });
  }

  private toConnection(row: Record<string, unknown>): Connection {
    return {
      id: row.id as string,
      tenantId: row.tenantId as string,
      connectorKey: row.connectorKey as string,
      name: row.name as string,
      description: row.description as string | undefined,
      credentials: row.credentials as Record<string, unknown>,
      config: row.config as Record<string, unknown>,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  }
}
