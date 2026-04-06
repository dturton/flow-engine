/**
 * Persistence layer for webhook registrations. Each webhook maps a unique
 * URL path to a flow and carries a shared secret for signature verification.
 */

import type { PrismaClient, Webhook as PrismaWebhook } from '../generated/prisma/client.js';

/** Domain model for a registered webhook endpoint. */
export interface Webhook {
  id: string;
  flowId: string;
  path: string;
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Repository for webhook CRUD — create, look up by flow or path, and delete. */
export class WebhookRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: { flowId: string; path: string; secret: string }): Promise<Webhook> {
    const row = await this.prisma.webhook.create({ data });
    return this.toWebhook(row);
  }

  async findByFlowId(flowId: string): Promise<Webhook[]> {
    const rows = await this.prisma.webhook.findMany({
      where: { flowId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toWebhook(r));
  }

  async findByPath(path: string): Promise<Webhook | null> {
    const row = await this.prisma.webhook.findUnique({ where: { path } });
    if (!row) return null;
    return this.toWebhook(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.webhook.delete({ where: { id } });
  }

  private toWebhook(row: PrismaWebhook): Webhook {
    return {
      id: row.id,
      flowId: row.flowId,
      path: row.path,
      secret: row.secret,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
