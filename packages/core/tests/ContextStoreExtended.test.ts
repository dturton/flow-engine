/**
 * Additional ContextStore tests covering: setVariable(), custom TTL,
 * ContextStoreError on missing context, and multiple S3 objects on release.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TriggerPayload, StepOutput } from '../src/types/run.js';
import { ContextStoreError } from '../src/errors.js';

// Must define mock classes before vi.mock (hoisted)
vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) { this.input = input; }
  }
  class GetObjectCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) { this.input = input; }
  }
  class DeleteObjectCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) { this.input = input; }
  }
  class ListObjectsV2Command {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) { this.input = input; }
  }
  return { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command };
});

import { ContextStore } from '../src/engine/ContextStore.js';

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, stepId: string, outputJson: string, ttl: number) => {
      const raw = store.get(key);
      if (!raw) return null;
      const ctx = JSON.parse(raw);
      ctx.steps[stepId] = JSON.parse(outputJson);
      store.set(key, JSON.stringify(ctx));
      return 'OK';
    }),
  };
}

function createMockS3() {
  const objects = new Map<string, string>();
  return {
    objects,
    send: vi.fn(async (command: { constructor: { name: string }; input?: Record<string, unknown> }) => {
      const name = command.constructor.name;
      const input = command.input ?? (command as Record<string, unknown>);

      if (name === 'PutObjectCommand') {
        objects.set(input.Key as string, input.Body as string);
        return {};
      }
      if (name === 'GetObjectCommand') {
        const body = objects.get(input.Key as string);
        return { Body: { transformToString: async () => body } };
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(input.Key as string);
        return {};
      }
      if (name === 'ListObjectsV2Command') {
        const prefix = input.Prefix as string;
        const contents = Array.from(objects.keys())
          .filter((k) => k.startsWith(prefix))
          .map((Key) => ({ Key }));
        return { Contents: contents };
      }
      return {};
    }),
  };
}

describe('ContextStore (additional)', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let s3: ReturnType<typeof createMockS3>;
  const bucket = 'test-bucket';
  const trigger: TriggerPayload = {
    type: 'manual',
    data: { x: 1 },
    receivedAt: new Date(),
  };

  beforeEach(() => {
    redis = createMockRedis();
    s3 = createMockS3();
  });

  // ── custom TTL ─────────────────────────────────────────────────────────────

  it('uses the provided custom TTL when writing to Redis', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket, 3600);
    await store.init('run-ttl', trigger, 'flow-1');

    expect(redis.set).toHaveBeenCalledWith('flow-ctx:run-ttl', expect.any(String), 'EX', 3600);
  });

  // ── get throws ContextStoreError when key is missing ──────────────────────

  it('get() throws ContextStoreError when the run context does not exist in Redis', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await expect(store.get('missing-run')).rejects.toThrow(ContextStoreError);
    await expect(store.get('missing-run')).rejects.toThrow('Context not found for run: missing-run');
  });

  // ── setVariable ────────────────────────────────────────────────────────────

  it('setVariable() persists a variable in the context', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await store.init('run-var', trigger, 'flow-1');

    await store.setVariable('run-var', 'myKey', 'myValue');

    const ctx = await store.get('run-var');
    expect(ctx.variables['myKey']).toBe('myValue');
  });

  it('setVariable() overwrites an existing variable', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await store.init('run-overwrite', trigger, 'flow-1');

    await store.setVariable('run-overwrite', 'counter', 1);
    await store.setVariable('run-overwrite', 'counter', 2);

    const ctx = await store.get('run-overwrite');
    expect(ctx.variables['counter']).toBe(2);
  });

  it('setVariable() throws ContextStoreError when the run does not exist', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await expect(store.setVariable('no-run', 'k', 'v')).rejects.toThrow(ContextStoreError);
  });

  // ── release deletes multiple S3 objects ───────────────────────────────────

  it('release() deletes all S3 objects for the run prefix', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await store.init('run-multi', trigger, 'flow-1');

    // Manually place several S3 objects with the run prefix
    s3.objects.set('flow-ctx/run-multi/step-a', '{}');
    s3.objects.set('flow-ctx/run-multi/step-b', '{}');
    s3.objects.set('flow-ctx/run-multi/step-c', '{}');

    await store.release('run-multi');

    expect(s3.objects.size).toBe(0);
  });

  it('release() removes the Redis key', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket);
    await store.init('run-del', trigger, 'flow-1');

    await store.release('run-del');

    expect(redis.store.has('flow-ctx:run-del')).toBe(false);
  });

  // ── commitStepOutput re-writes context to Redis ───────────────────────────

  it('commitStepOutput updates the TTL in Redis', async () => {
    const store = new ContextStore(redis as any, s3 as any, bucket, 1800);
    await store.init('run-commit', trigger, 'flow-1');

    const output: StepOutput = { data: { x: 1 }, completedAt: new Date(), durationMs: 5 };
    await store.commitStepOutput('run-commit', 'step-x', output);

    // redis.set is called once for init; commitStepOutput uses eval for atomicity
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    // The eval call should pass the custom TTL as the last argument
    const evalCalls = (redis.eval as ReturnType<typeof vi.fn>).mock.calls;
    expect(evalCalls[0][5]).toBe(1800);
  });
});
