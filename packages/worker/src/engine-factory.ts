import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import {
  FlowEngine,
  DagResolver,
  ContextStore,
  StepExecutorRegistry,
  InputResolver,
  RetryManager,
  FlowRunRepository,
  ActionExecutor,
  ConnectorRegistry,
  TransformExecutor,
  BranchExecutor,
  ScriptExecutor,
  LoopExecutor,
  DelayExecutor,
} from '@flow-engine/core';
import type { WorkerConfig } from './config.js';
import { HttpConnector } from './connectors/http.js';

export interface EngineContext {
  engine: FlowEngine;
  prisma: PrismaClient;
  redis: Redis;
  s3: S3Client;
}

export function createEngineContext(config: WorkerConfig): EngineContext {
  const prisma = new PrismaClient();
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const s3 = new S3Client({
    region: config.s3Region,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
  });

  const dagResolver = new DagResolver();
  const contextStore = new ContextStore(redis, s3, config.s3Bucket, config.contextTtlSeconds);
  const inputResolver = new InputResolver();
  const retryManager = new RetryManager();
  const runRepository = new FlowRunRepository(prisma);

  // Set up executor registry with built-in executors
  const executorRegistry = new StepExecutorRegistry();
  const connectorRegistry = new ConnectorRegistry();
  connectorRegistry.register('http', new HttpConnector());
  executorRegistry.register(new ActionExecutor(connectorRegistry));
  executorRegistry.register(new TransformExecutor());
  executorRegistry.register(new BranchExecutor());
  executorRegistry.register(new ScriptExecutor());
  executorRegistry.register(new LoopExecutor());
  executorRegistry.register(new DelayExecutor());

  const engine = new FlowEngine(
    dagResolver,
    executorRegistry,
    contextStore,
    inputResolver,
    retryManager,
    runRepository,
    {
      maxConcurrentSteps: config.maxConcurrentSteps,
      stepTimeoutMs: config.stepTimeoutMs,
      defaultRetryPolicy: {
        maxAttempts: 3,
        strategy: 'exponential',
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        retryableErrors: ['network', 'rateLimit', 'timeout', 'serverError'],
      },
    }
  );

  return { engine, prisma, redis, s3 };
}

export async function closeEngineContext(ctx: EngineContext): Promise<void> {
  await ctx.redis.quit();
  await ctx.prisma.$disconnect();
  ctx.s3.destroy();
}
