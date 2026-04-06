/**
 * Delay step executor — pauses execution for a configurable duration.
 * Reads `delayMs` from resolved inputs (defaults to 1000ms).
 */

import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';

/** Sleeps for the specified `delayMs` then returns. Used for rate-limiting or sequencing. */
export class DelayExecutor implements StepExecutor {
  readonly type: StepType = 'delay';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, resolvedInputs } = input;
    const startTime = Date.now();

    const delayMs = typeof resolvedInputs.delayMs === 'number'
      ? resolvedInputs.delayMs
      : parseInt(String(resolvedInputs.delayMs ?? '1000'), 10);

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const durationMs = Date.now() - startTime;

    return {
      output: { delayed: true, delayMs },
      logs: [
        {
          level: 'info',
          message: `Delay step "${step.id}" waited ${delayMs}ms`,
          timestamp: new Date(),
        },
      ],
      durationMs,
    };
  }
}
