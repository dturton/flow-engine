import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';

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
