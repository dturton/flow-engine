import { describe, it, expect } from 'vitest';
import { RetryManager } from '../src/engine/RetryManager.js';
import type { StepError } from '../src/types/run.js';
import type { RetryPolicy } from '../src/types/flow.js';

function makeError(overrides: Partial<StepError> = {}): StepError {
  return {
    code: 'TEST_ERROR',
    message: 'test error',
    category: 'network',
    retryable: true,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return {
    maxAttempts: 3,
    strategy: 'fixed',
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    retryableErrors: ['network', 'rateLimit', 'timeout', 'serverError'],
    ...overrides,
  };
}

describe('RetryManager', () => {
  const manager = new RetryManager();

  it('does not retry when attempt >= policy.maxAttempts', () => {
    expect(manager.shouldRetry(makeError(), makePolicy({ maxAttempts: 3 }), 3)).toBe(false);
    expect(manager.shouldRetry(makeError(), makePolicy({ maxAttempts: 3 }), 4)).toBe(false);
  });

  it('does not retry when error.retryable === false', () => {
    expect(manager.shouldRetry(makeError({ retryable: false }), makePolicy(), 1)).toBe(false);
  });

  it('does not retry when error category is not in policy.retryableErrors', () => {
    const error = makeError({ category: 'validation' });
    expect(manager.shouldRetry(error, makePolicy(), 1)).toBe(false);
  });

  it('returns initialDelayMs for fixed strategy regardless of attempt number', () => {
    const policy = makePolicy({ strategy: 'fixed', initialDelayMs: 500 });
    expect(manager.getDelayMs(policy, 0)).toBe(500);
    expect(manager.getDelayMs(policy, 1)).toBe(500);
    expect(manager.getDelayMs(policy, 5)).toBe(500);
  });

  it('returns exponentially increasing delay for exponential strategy, capped at maxDelayMs', () => {
    const policy = makePolicy({
      strategy: 'exponential',
      initialDelayMs: 100,
      maxDelayMs: 5000,
    });

    expect(manager.getDelayMs(policy, 0)).toBe(100);   // 100 * 2^0
    expect(manager.getDelayMs(policy, 1)).toBe(200);   // 100 * 2^1
    expect(manager.getDelayMs(policy, 2)).toBe(400);   // 100 * 2^2
    expect(manager.getDelayMs(policy, 3)).toBe(800);   // 100 * 2^3
    expect(manager.getDelayMs(policy, 10)).toBe(5000);  // capped
  });

  it('returns a value within the expected range for jitter strategy', () => {
    const policy = makePolicy({
      strategy: 'jitter',
      initialDelayMs: 100,
      maxDelayMs: 50000,
    });

    // For attempt 2: exponential = 100 * 2^2 = 400
    // Jitter adds 0-30% noise: range 400..520, capped at maxDelayMs
    for (let i = 0; i < 20; i++) {
      const delay = manager.getDelayMs(policy, 2);
      expect(delay).toBeGreaterThanOrEqual(400);
      expect(delay).toBeLessThanOrEqual(520);
    }
  });
});
