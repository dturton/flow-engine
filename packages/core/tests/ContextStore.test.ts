import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TriggerPayload, StepOutput } from '../src/types/run.js';

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

// Mock Redis
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
  };
}

// Mock S3
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
        return {
          Body: { transformToString: async () => body },
        };
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

describe('ContextStore', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let s3: ReturnType<typeof createMockS3>;
  let store: ContextStore;
  const bucket = 'test-bucket';
  const trigger: TriggerPayload = {
    type: 'manual',
    data: { foo: 'bar' },
    receivedAt: new Date(),
  };

  beforeEach(() => {
    redis = createMockRedis();
    s3 = createMockS3();
    store = new ContextStore(redis as any, s3 as any, bucket);
  });

  it('init stores a new FlowContext in Redis', async () => {
    const ctx = await store.init('run-1', trigger, 'flow-1');

    expect(ctx.runId).toBe('run-1');
    expect(ctx.flowId).toBe('flow-1');
    expect(ctx.trigger).toEqual(trigger);
    expect(ctx.steps).toEqual({});
    expect(ctx.variables).toEqual({});
    expect(redis.set).toHaveBeenCalledWith('flow-ctx:run-1', expect.any(String), 'EX', 86400);
  });

  it('commitStepOutput merges step output into the existing context', async () => {
    await store.init('run-1', trigger, 'flow-1');

    const output: StepOutput = {
      data: { orderId: 123 },
      completedAt: new Date(),
      durationMs: 50,
    };

    await store.commitStepOutput('run-1', 'step-a', output);

    const ctx = await store.get('run-1');
    expect(ctx.steps['step-a']).toBeDefined();
    expect(ctx.steps['step-a'].data).toEqual({ orderId: 123 });
  });

  it('large payloads (>64KB) are stored in S3 with a __s3ref pointer in Redis', async () => {
    await store.init('run-1', trigger, 'flow-1');

    // Create a payload > 64KB
    const largeData: Record<string, unknown> = {};
    for (let i = 0; i < 2000; i++) {
      largeData[`key_${i}`] = 'x'.repeat(50);
    }

    const output: StepOutput = {
      data: largeData,
      completedAt: new Date(),
      durationMs: 100,
    };

    await store.commitStepOutput('run-1', 'big-step', output);

    // Verify S3 was used
    expect(s3.objects.size).toBe(1);
    const s3Key = Array.from(s3.objects.keys())[0];
    expect(s3Key).toBe('flow-ctx/run-1/step-big-step');

    // Verify Redis has the sentinel
    const raw = JSON.parse(redis.store.get('flow-ctx:run-1')!);
    expect(raw.steps['big-step'].__s3ref).toBe(s3Key);
  });

  it('release deletes the Redis key and any associated S3 objects', async () => {
    await store.init('run-1', trigger, 'flow-1');
    s3.objects.set('flow-ctx/run-1/step-a', '{}');

    await store.release('run-1');

    expect(redis.store.has('flow-ctx:run-1')).toBe(false);
    expect(s3.objects.size).toBe(0);
  });

  it('get reconstructs the full context including S3-offloaded values', async () => {
    await store.init('run-1', trigger, 'flow-1');

    const offloadedOutput: StepOutput = {
      data: { result: 'from-s3' },
      completedAt: new Date(),
      durationMs: 10,
    };

    const s3Key = 'flow-ctx/run-1/step-offloaded';
    s3.objects.set(s3Key, JSON.stringify(offloadedOutput));

    // Set the sentinel in Redis
    const ctx = JSON.parse(redis.store.get('flow-ctx:run-1')!);
    ctx.steps['offloaded'] = { __s3ref: s3Key };
    redis.store.set('flow-ctx:run-1', JSON.stringify(ctx));

    const result = await store.get('run-1');
    expect((result.steps['offloaded'] as unknown as Record<string, unknown>).data).toEqual({ result: 'from-s3' });
  });
});
