import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { PrismaClient, Prisma, Connection as PrismaConnection } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm' as const;

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex) return null;
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return key;
}

function encryptCredentials(creds: Record<string, unknown>): Prisma.InputJsonValue {
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[ConnectionRepository] CREDENTIALS_ENCRYPTION_KEY is not set. Credentials stored unencrypted.',
      );
    }
    return creds as Prisma.InputJsonValue;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const text = JSON.stringify(creds);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  return { __flow_enc_v1: payload } as Prisma.InputJsonValue;
}

function decryptCredentials(value: Prisma.JsonValue): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '__flow_enc_v1' in value &&
    typeof (value as Record<string, unknown>)['__flow_enc_v1'] === 'string'
  ) {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error(
        'Encrypted credentials found in database but CREDENTIALS_ENCRYPTION_KEY is not set',
      );
    }
    const payload = (value as { __flow_enc_v1: string }).__flow_enc_v1;
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted credentials payload');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
  }
  // Plaintext (unencrypted) JSON — returned as-is
  return value as Record<string, unknown>;
}

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
        credentials: encryptCredentials(data.credentials),
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
        ...(data.credentials !== undefined && {
          credentials: encryptCredentials(data.credentials),
        }),
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
    const where: Prisma.ConnectionWhereInput = { tenantId };
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

  private toConnection(row: PrismaConnection): Connection {
    return {
      id: row.id,
      tenantId: row.tenantId,
      connectorKey: row.connectorKey,
      name: row.name,
      description: row.description ?? undefined,
      credentials: decryptCredentials(row.credentials),
      config: row.config as Record<string, unknown>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
