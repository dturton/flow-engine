import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient(url?: string): InstanceType<typeof PrismaClient> {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
