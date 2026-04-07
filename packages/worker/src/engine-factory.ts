/**
 * Engine factory module.
 * Creates a fully-wired FlowEngine instance with all infrastructure dependencies
 * (Prisma, Redis, S3) and registers built-in step executors and connectors.
 * The worker calls {@link createEngineContext} once at startup and {@link closeEngineContext}
 * on shutdown to manage the lifecycle of shared resources.
 */

import { Redis } from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import {
  createPrismaClient,
  FlowEngine,
  DagResolver,
  ContextStore,
  StepExecutorRegistry,
  InputResolver,
  RetryManager,
  FlowRunRepository,
  ConnectionRepository,
  ActionExecutor,
  ConnectorRegistry,
  TransformExecutor,
  BranchExecutor,
  ScriptExecutor,
  LoopExecutor,
  DelayExecutor,
} from '@flow-engine/core';
import type { Connector, ConnectionResolver, PrismaClient } from '@flow-engine/core';
import type { WorkerConfig } from './config.js';
import { HttpConnector, ShopifyConnector, ConnectorFactory } from '@flow-engine/connectors';
import type { Connection } from '@flow-engine/core';

/** Holds the FlowEngine and all infrastructure clients so they can be torn down together */
export interface EngineContext {
  engine: FlowEngine;
  prisma: InstanceType<typeof PrismaClient>;
  redis: Redis;
  s3: S3Client;
}

/**
 * Creates infrastructure clients (Prisma, Redis, S3), wires up all step executors
 * and connectors, and returns a ready-to-use FlowEngine bundled with its dependencies.
 */
export function createEngineContext(config: WorkerConfig): EngineContext {
  const prisma = createPrismaClient();
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
  const connectionRepository = new ConnectionRepository(prisma);

  // Connector factory: creates connector instances from stored Connection records
  const connectorFactory = new ConnectorFactory();
  connectorFactory.registerBuilder('shopify', (conn: Connection) => {
    return new ShopifyConnector({
      storeUrl: conn.credentials.storeUrl as string,
      accessToken: conn.credentials.accessToken as string | undefined,
      clientId: conn.credentials.clientId as string | undefined,
      clientSecret: conn.credentials.clientSecret as string | undefined,
      apiVersion: conn.config.apiVersion as string | undefined,
      rateLimitPerSecond: conn.config.rateLimitPerSecond as number | undefined,
    });
  });
  connectorFactory.registerBuilder('http', (_conn: Connection) => new HttpConnector());

  // Connector cache: keyed by connectionId so each connection shares one instance
  // (and therefore one RateLimiter) across concurrent steps.
  const connectorCache = new Map<string, Connector>();

  // Connection resolver: loads a Connection from DB and creates a Connector via the factory
  const connectionResolver: ConnectionResolver = {
    async resolve(connectionId: string): Promise<Connector> {
      const cached = connectorCache.get(connectionId);
      if (cached) return cached;

      const connection = await connectionRepository.findById(connectionId);
      if (!connection) {
        throw new Error(`Connection not found: "${connectionId}"`);
      }
      const connector = connectorFactory.create(connection);
      connectorCache.set(connectionId, connector);
      return connector;
    },
  };

  // Set up executor registry with built-in executors
  const executorRegistry = new StepExecutorRegistry();
  const connectorRegistry = new ConnectorRegistry();
  connectorRegistry.register('http', new HttpConnector());
  executorRegistry.register(new ActionExecutor(connectorRegistry, connectionResolver));
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

/** Gracefully disconnects all infrastructure clients */
export async function closeEngineContext(ctx: EngineContext): Promise<void> {
  await ctx.redis.quit();
  await ctx.prisma.$disconnect();
  ctx.s3.destroy();
}
