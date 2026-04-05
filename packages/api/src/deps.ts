import { Redis } from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { createPrismaClient, FlowRunRepository, FlowDefinitionRepository, ConnectionRepository } from '@flow-engine/core';
import type { PrismaClient } from '@flow-engine/core';
import type { AppConfig } from './config.js';

export interface AppDeps {
  prisma: InstanceType<typeof PrismaClient>;
  redis: Redis;
  s3: S3Client;
  flowQueue: Queue;
  runRepository: FlowRunRepository;
  flowRepository: FlowDefinitionRepository;
  connectionRepository: ConnectionRepository;
}

export function createDeps(config: AppConfig): AppDeps {
  const prisma = createPrismaClient();

  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  const s3 = new S3Client({
    region: config.s3Region,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
  });

  const queueRedis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const flowQueue = new Queue(config.bullmqQueueName, {
    connection: queueRedis,
  });

  const runRepository = new FlowRunRepository(prisma);
  const flowRepository = new FlowDefinitionRepository(prisma);
  const connectionRepository = new ConnectionRepository(prisma);

  return { prisma, redis, s3, flowQueue, runRepository, flowRepository, connectionRepository };
}

export async function closeDeps(deps: AppDeps): Promise<void> {
  await deps.flowQueue.close();
  await deps.redis.quit();
  await deps.prisma.$disconnect();
  deps.s3.destroy();
}
