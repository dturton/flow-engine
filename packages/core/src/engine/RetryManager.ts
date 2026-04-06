/**
 * Retry decision and backoff delay calculation for failed steps.
 * Supports fixed, exponential, and jitter (exponential + random noise) strategies.
 */

import type { StepError } from '../types/run.js';
import type { RetryPolicy } from '../types/flow.js';

/**
 * Stateless helper that determines whether a failed step should be retried
 * and computes the appropriate backoff delay.
 */
export class RetryManager {
  /** Returns true if the error is retryable, within attempt limits, and matches the policy's error categories. */
  shouldRetry(error: StepError, policy: RetryPolicy, attempt: number): boolean {
    if (attempt >= policy.maxAttempts) return false;
    if (!error.retryable) return false;
    if (!policy.retryableErrors.includes(error.category as typeof policy.retryableErrors[number])) {
      return false;
    }
    return true;
  }

  /**
   * Computes the delay before the next retry attempt.
   * - fixed: constant delay
   * - exponential: initialDelay * 2^attempt, capped at maxDelay
   * - jitter: exponential + up to 30% random noise, capped at maxDelay
   */
  getDelayMs(policy: RetryPolicy, attempt: number): number {
    switch (policy.strategy) {
      case 'fixed':
        return policy.initialDelayMs;

      case 'exponential': {
        const delay = policy.initialDelayMs * Math.pow(2, attempt);
        return Math.min(delay, policy.maxDelayMs);
      }

      case 'jitter': {
        const exponentialDelay = policy.initialDelayMs * Math.pow(2, attempt);
        const capped = Math.min(exponentialDelay, policy.maxDelayMs);
        const jitter = capped * Math.random() * 0.3;
        return Math.min(capped + jitter, policy.maxDelayMs);
      }

      default:
        return policy.initialDelayMs;
    }
  }
}
