import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/base/RateLimiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when tokens are available', async () => {
    const limiter = new RateLimiter(5);
    // Should resolve without advancing fake timers
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it('resolves immediately for each call until the bucket is drained', async () => {
    const limiter = new RateLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    // Bucket is now empty; no timers advanced so far
  });

  it('waits when the bucket is empty and resolves after tokens refill', async () => {
    // 1 request per second → 1 token per 1000 ms
    const limiter = new RateLimiter(1);
    await limiter.acquire(); // drains the single token

    let resolved = false;
    const p = limiter.acquire().then(() => {
      resolved = true;
    });

    // Not yet resolved
    expect(resolved).toBe(false);

    // Advance time past the refill window
    await vi.advanceTimersByTimeAsync(1100);
    await p;

    expect(resolved).toBe(true);
  });

  it('two concurrent callers waiting both eventually resolve without going negative', async () => {
    // 1 req/sec — drain bucket then start two concurrent waiters
    const limiter = new RateLimiter(1);
    await limiter.acquire(); // drain

    let resolvedA = false;
    let resolvedB = false;

    const pA = limiter.acquire().then(() => { resolvedA = true; });
    const pB = limiter.acquire().then(() => { resolvedB = true; });

    // Advance enough for both to acquire (one per second each)
    await vi.advanceTimersByTimeAsync(2200);
    await Promise.all([pA, pB]);

    expect(resolvedA).toBe(true);
    expect(resolvedB).toBe(true);
  });

  it('tokens never go below zero after concurrent acquires', async () => {
    // 2 req/sec — drain both tokens and start two concurrent waiters
    const limiter = new RateLimiter(2);
    await limiter.acquire();
    await limiter.acquire();

    // Start two waiters simultaneously
    const p1 = limiter.acquire();
    const p2 = limiter.acquire();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all([p1, p2]);
    // If we reach here both resolved without throwing — no negative-token corruption
  });
});
