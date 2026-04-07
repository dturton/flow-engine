/**
 * Flow execution context store backed by Redis (primary) and S3 (overflow).
 * Small payloads live entirely in Redis; step outputs exceeding 64KB are
 * transparently offloaded to S3 and rehydrated on read.
 */

import type { Redis } from 'ioredis';
import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { FlowContext, TriggerPayload, StepOutput } from '../types/run.js';
import { ContextStoreError } from '../errors.js';

const DEFAULT_TTL_SECONDS = 86400; // 24 hours
const LARGE_PAYLOAD_THRESHOLD = 64 * 1024; // 64KB — payloads above this are offloaded to S3
/** Sentinel key stored in Redis in place of large payloads, pointing to the S3 object key. */
const S3_REF_SENTINEL = '__s3ref';

/**
 * Manages per-run execution context in Redis with automatic S3 offloading
 * for large step outputs. Context is TTL-bounded and cleaned up on release.
 */
export class ContextStore {
  private ttl: number;

  constructor(
    private redis: Redis,
    private s3: S3Client,
    private bucket: string,
    ttlSeconds?: number
  ) {
    this.ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /** Creates and persists a fresh context for a new flow run. */
  async init(runId: string, trigger: TriggerPayload, flowId: string): Promise<FlowContext> {
    const context: FlowContext = {
      runId,
      flowId,
      trigger,
      steps: {},
      variables: {},
    };

    const key = this.redisKey(runId);
    const serialized = JSON.stringify(context);
    await this.redis.set(key, serialized, 'EX', this.ttl);
    return context;
  }

  /** Retrieves the context for a run, rehydrating any S3-offloaded step outputs. */
  async get(runId: string): Promise<FlowContext> {
    const key = this.redisKey(runId);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new ContextStoreError(`Context not found for run: ${runId}`);
    }

    const context: FlowContext = JSON.parse(raw);

    // Rehydrate any S3-offloaded step outputs
    for (const [stepId, stepOutput] of Object.entries(context.steps)) {
      const output = stepOutput as unknown as Record<string, unknown>;
      if (output && typeof output === 'object' && S3_REF_SENTINEL in output) {
        context.steps[stepId] = (await this.fetchFromS3(
          output[S3_REF_SENTINEL] as string
        )) as StepOutput;
      }
    }

    return context;
  }

  /**
   * Lua script for atomic step output commit. Reads the context JSON from Redis,
   * merges the new step output, and writes it back in a single atomic operation
   * to prevent lost updates when multiple steps complete concurrently.
   */
  private static readonly COMMIT_LUA = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return nil end
    local ctx = cjson.decode(raw)
    ctx.steps[ARGV[1]] = cjson.decode(ARGV[2])
    redis.call('SET', KEYS[1], cjson.encode(ctx), 'EX', tonumber(ARGV[3]))
    return 'OK'
  `;

  /** Stores a step's output in the context, offloading to S3 if it exceeds the size threshold. */
  async commitStepOutput(runId: string, stepId: string, output: StepOutput): Promise<void> {
    const key = this.redisKey(runId);

    let valueToStore: StepOutput | Record<string, unknown>;
    if (await this.isLargePayload(output)) {
      const s3Key = await this.offloadToS3(runId, `step-${stepId}`, output);
      valueToStore = { [S3_REF_SENTINEL]: s3Key } as unknown as StepOutput;
    } else {
      valueToStore = output;
    }

    // Atomically merge into the context via Lua to avoid read-modify-write races
    const result = await this.redis.eval(
      ContextStore.COMMIT_LUA, 1, key, stepId, JSON.stringify(valueToStore), this.ttl,
    );

    if (result === null) {
      throw new ContextStoreError(`Context not found for run: ${runId}`);
    }
  }

  async setVariable(runId: string, varKey: string, value: unknown): Promise<void> {
    const context = await this.getRaw(runId);
    context.variables[varKey] = value;
    const key = this.redisKey(runId);
    await this.redis.set(key, JSON.stringify(context), 'EX', this.ttl);
  }

  /** Deletes all context data (Redis key + any S3 objects) for a completed/failed run. */
  async release(runId: string): Promise<void> {
    const key = this.redisKey(runId);

    // Delete any S3 objects for this run
    try {
      const listResult = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `flow-ctx/${runId}/`,
        })
      );

      if (listResult.Contents && listResult.Contents.length > 0) {
        for (const obj of listResult.Contents) {
          if (obj.Key) {
            await this.s3.send(
              new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key })
            );
          }
        }
      }
    } catch {
      // Best-effort S3 cleanup
    }

    await this.redis.del(key);
  }

  private async isLargePayload(value: unknown): Promise<boolean> {
    const serialized = JSON.stringify(value);
    return Buffer.byteLength(serialized, 'utf-8') > LARGE_PAYLOAD_THRESHOLD;
  }

  private async offloadToS3(runId: string, key: string, value: unknown): Promise<string> {
    const s3Key = `flow-ctx/${runId}/${key}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
      })
    );
    return s3Key;
  }

  private async fetchFromS3(s3Key: string): Promise<unknown> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key })
    );
    const body = await result.Body!.transformToString();
    return JSON.parse(body);
  }

  private async getRaw(runId: string): Promise<FlowContext> {
    const key = this.redisKey(runId);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new ContextStoreError(`Context not found for run: ${runId}`);
    }
    return JSON.parse(raw);
  }

  private redisKey(runId: string): string {
    return `flow-ctx:${runId}`;
  }
}
