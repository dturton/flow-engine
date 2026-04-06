/**
 * Worker configuration module.
 * Loads and validates environment variables needed by the BullMQ worker process,
 * providing sensible defaults for optional settings and failing fast on missing required ones.
 */

/** Configuration values for the BullMQ worker process */
export interface WorkerConfig {
  redisUrl: string;
  databaseUrl: string;
  s3Bucket: string;
  s3Region: string;
  s3Endpoint?: string;
  queueName: string;
  concurrency: number;
  maxConcurrentSteps: number;
  stepTimeoutMs: number;
  contextTtlSeconds: number;
}

/** Reads an env var or throws if it is not set */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Parses a string as an integer, throwing on NaN */
function parseIntStrict(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer for ${name}: "${value}"`);
  return n;
}

/** Builds a WorkerConfig from environment variables, applying defaults where possible */
export function loadConfig(): WorkerConfig {
  return {
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    databaseUrl: requireEnv('DATABASE_URL'),
    s3Bucket: process.env.S3_BUCKET ?? 'flow-engine',
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3Endpoint: process.env.S3_ENDPOINT,
    queueName: process.env.BULLMQ_QUEUE ?? 'flow-runs',
    concurrency: parseIntStrict(process.env.WORKER_CONCURRENCY ?? '3', 'WORKER_CONCURRENCY'),
    maxConcurrentSteps: parseIntStrict(process.env.MAX_CONCURRENT_STEPS ?? '5', 'MAX_CONCURRENT_STEPS'),
    stepTimeoutMs: parseIntStrict(process.env.STEP_TIMEOUT_MS ?? '30000', 'STEP_TIMEOUT_MS'),
    contextTtlSeconds: parseIntStrict(process.env.CONTEXT_TTL_SECONDS ?? '86400', 'CONTEXT_TTL_SECONDS'),
  };
}
