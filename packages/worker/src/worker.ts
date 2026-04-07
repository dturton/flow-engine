/**
 * BullMQ worker entry point.
 * Connects to the job queue, processes flow execution jobs by delegating to
 * the FlowEngine, and handles graceful shutdown on SIGTERM/SIGINT.
 */

import { Worker, Queue, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import type { FlowDefinition, TriggerPayload } from '@flow-engine/core';
import { loadConfig } from './config.js';
import { createEngineContext, closeEngineContext, type EngineContext } from './engine-factory.js';

/** Payload shape for jobs enqueued by the API */
interface FlowJobData {
  flow: FlowDefinition;
  trigger: TriggerPayload;
}

/** DLQ entry metadata */
interface DlqEntry {
  originalJobId: string | undefined;
  data: FlowJobData;
  error: string;
  failedAt: string;
}

/** Metrics tracked by the worker */
interface WorkerMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  totalDurationMs: number;
}

const SHUTDOWN_TIMEOUT_MS = 30_000;
const METRICS_INTERVAL_MS = 60_000;

let engineCtx: EngineContext;
let shuttingDown = false;

const metrics: WorkerMetrics = {
  jobsProcessed: 0,
  jobsFailed: 0,
  totalDurationMs: 0,
};

/**
 * Restores Date objects from ISO strings after BullMQ's JSON round-trip.
 * BullMQ serializes job data as JSON, which converts Dates to strings.
 */
function rehydrateDates(data: FlowJobData): FlowJobData {
  return {
    flow: {
      ...data.flow,
      createdAt: new Date(data.flow.createdAt),
      updatedAt: new Date(data.flow.updatedAt),
    },
    trigger: {
      ...data.trigger,
      receivedAt: new Date(data.trigger.receivedAt),
    },
  };
}

/** Processes a single flow execution job by running it through the FlowEngine */
async function processJob(job: Job<FlowJobData>): Promise<void> {
  const startTime = Date.now();
  const { flow, trigger } = rehydrateDates(job.data);
  console.log(`[worker] Processing job ${job.id} — flow "${flow.name}" (${flow.id})`);

  let status: 'completed' | 'failed' = 'completed';
  try {
    const run = await engineCtx.engine.execute(flow, trigger);

    console.log(`[worker] Job ${job.id} finished — run ${run.id} status: ${run.status}`);

    if (run.status === 'failed') {
      status = 'failed';
      console.error(`[worker] Flow run ${run.id} failed at step ${run.error?.stepId}: ${run.error?.error.message}`);
      // Don't throw — the run is already persisted as failed. Throwing would cause
      // BullMQ to retry, creating duplicate FlowRun records.
    }
  } catch (err) {
    status = 'failed';
    throw err;
  } finally {
    const durationMs = Date.now() - startTime;
    if (status === 'completed') {
      metrics.jobsProcessed++;
    } else {
      metrics.jobsFailed++;
    }
    metrics.totalDurationMs += durationMs;
    console.log(`[worker] Job ${job.id} — flowId: ${flow.id}, duration: ${durationMs}ms, status: ${status}`);
  }
}

/**
 * Verifies that Redis, PostgreSQL, and S3 are reachable before starting the worker.
 */
async function runHealthChecks(config: ReturnType<typeof loadConfig>, ctx: EngineContext): Promise<void> {
  console.log('[worker] Running startup health checks...');

  // Redis
  try {
    const pong = await ctx.redis.ping();
    if (pong !== 'PONG') throw new Error(`Unexpected ping response: ${pong}`);
  } catch (err) {
    console.error('[worker] Health check failed: Redis is not reachable', err);
    process.exit(1);
  }

  // Database
  try {
    await ctx.prisma.$queryRawUnsafe('SELECT 1');
  } catch (err) {
    console.error('[worker] Health check failed: Database is not reachable', err);
    process.exit(1);
  }

  // S3
  try {
    await ctx.s3.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
  } catch (err) {
    console.error('[worker] Health check failed: S3 is not reachable', err);
    process.exit(1);
  }

  console.log('[worker] All health checks passed');
}

/** Initializes the engine, starts the BullMQ worker, and registers shutdown handlers */
async function main() {
  const config = loadConfig();
  engineCtx = createEngineContext(config);

  // --- Startup health checks ---
  await runHealthChecks(config, engineCtx);

  // --- Dead-letter queue ---
  const dlqRedis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const dlq = new Queue<DlqEntry>(`${config.queueName}-dlq`, { connection: dlqRedis });

  // --- Worker ---
  const workerRedis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker<FlowJobData>(
    config.queueName,
    processJob,
    {
      connection: workerRedis,
      concurrency: config.concurrency,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);

    // Move to DLQ if all attempts exhausted
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      try {
        await dlq.add('dead-letter', {
          originalJobId: job.id,
          data: job.data,
          error: err.message,
          failedAt: new Date().toISOString(),
        });
        console.log(`[worker] Job ${job.id} moved to DLQ "${config.queueName}-dlq"`);
      } catch (dlqErr) {
        console.error(`[worker] Failed to move job ${job.id} to DLQ:`, dlqErr);
      }
    }
  });

  worker.on('stalled', (jobId: string) => {
    console.warn(`[worker] Job ${jobId} has stalled`);
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err);
  });

  // --- Metrics logging ---
  const metricsInterval = setInterval(() => {
    const avg = metrics.jobsProcessed > 0
      ? Math.round(metrics.totalDurationMs / metrics.jobsProcessed)
      : 0;
    console.log(
      `[worker] Metrics — processed: ${metrics.jobsProcessed}, failed: ${metrics.jobsFailed}, avg duration: ${avg}ms`
    );
  }, METRICS_INTERVAL_MS);
  metricsInterval.unref();

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);

    const forceTimer = setTimeout(() => {
      console.error('[worker] Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      clearInterval(metricsInterval);
      await worker.close();
      await dlq.close();
      await dlqRedis.quit();
      await closeEngineContext(engineCtx);
      console.log('[worker] Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[worker] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // --- Process-level error handlers ---
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] Unhandled rejection:', reason);
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] Uncaught exception:', err);
    void shutdown('uncaughtException');
  });

  console.log(`[worker] Listening on queue "${config.queueName}" (concurrency: ${config.concurrency})`);
}

main().catch((err) => {
  console.error('[worker] Failed to start:', err);
  process.exit(1);
});
