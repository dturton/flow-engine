/**
 * Factory for creating a Prisma client configured with the PostgreSQL driver adapter.
 * Reads `DATABASE_URL` from the environment if no explicit URL is provided.
 */

import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

/** Creates a PrismaClient backed by the `@prisma/adapter-pg` driver adapter. */
export function createPrismaClient(url?: string): InstanceType<typeof PrismaClient> {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
