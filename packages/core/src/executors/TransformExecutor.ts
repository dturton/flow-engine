/**
 * Transform step executor — a pure passthrough that emits the resolved inputs
 * as its output. Useful for reshaping data between steps using input mappings
 * without invoking any external connector.
 */

import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';

/** Passes resolved inputs directly through as output — all transformation is in the input mapping. */
export class TransformExecutor implements StepExecutor {
  readonly type: StepType = 'transform';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const startTime = Date.now();

    // For transform steps, the resolved inputs ARE the output
    const output = { ...input.resolvedInputs };
    const durationMs = Date.now() - startTime;

    return {
      output,
      logs: [
        {
          level: 'info',
          message: `Transform step "${input.step.id}" completed`,
          timestamp: new Date(),
        },
      ],
      durationMs,
    };
  }
}
