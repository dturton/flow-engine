import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { FlowDefinition, TriggerPayload } from '@flow-engine/core';
import { loadConfig } from './config.js';
import { createEngineContext, closeEngineContext, type EngineContext } from './engine-factory.js';

interface FlowJobData {
  flow: FlowDefinition;
  trigger: TriggerPayload;
}

let engineCtx: EngineContext;

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

async function processJob(job: Job<FlowJobData>): Promise<void> {
  const { flow, trigger } = rehydrateDates(job.data);
  console.log(`[worker] Processing job ${job.id} — flow "${flow.name}" (${flow.id})`);

  const run = await engineCtx.engine.execute(flow, trigger);

  console.log(`[worker] Job ${job.id} finished — run ${run.id} status: ${run.status}`);

  if (run.status === 'failed') {
    console.error(`[worker] Flow run ${run.id} failed at step ${run.error?.stepId}: ${run.error?.error.message}`);
    // Don't throw — the run is already persisted as failed. Throwing would cause
    // BullMQ to retry, creating duplicate FlowRun records.
  }
}

async function main() {
  const config = loadConfig();
  engineCtx = createEngineContext(config);

  const workerRedis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker<FlowJobData>(
    config.queueName,
    processJob,
    {
      connection: workerRedis,
      concurrency: config.concurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err);
  });

  const shutdown = async () => {
    console.log('[worker] Shutting down...');
    await worker.close();
    await closeEngineContext(engineCtx);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`[worker] Listening on queue "${config.queueName}" (concurrency: ${config.concurrency})`);
}

main().catch((err) => {
  console.error('[worker] Failed to start:', err);
  process.exit(1);
});
