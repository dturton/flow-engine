/**
 * Application configuration. Reads environment variables with sensible
 * defaults; only DATABASE_URL is strictly required.
 */

/** All configuration values consumed by the API server. */
export interface AppConfig {
  port: number;
  host: string;
  redisUrl: string;
  databaseUrl: string;
  s3Bucket: string;
  s3Region: string;
  s3Endpoint?: string;
  bullmqQueueName: string;
  corsOrigin: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Parse environment variables into an {@link AppConfig}, throwing on missing required vars. */
export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    databaseUrl: requireEnv('DATABASE_URL'),
    s3Bucket: process.env.S3_BUCKET ?? 'flow-engine',
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3Endpoint: process.env.S3_ENDPOINT,
    bullmqQueueName: process.env.BULLMQ_QUEUE ?? 'flow-runs',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  };
}
