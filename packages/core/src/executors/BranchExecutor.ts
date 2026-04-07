/**
 * Branch step executor — evaluates JSONata conditions against the flow context
 * and routes execution to the first matching branch's target step.
 */

import jsonata from 'jsonata';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';
import { BranchResolutionError } from '../errors.js';

/**
 * Iterates through branch cases in order, evaluating each JSONata `when` expression.
 * Returns the `nextStepId` of the first case that evaluates to `true`.
 * Throws {@link BranchResolutionError} if no branch matches.
 */
export class BranchExecutor implements StepExecutor {
  readonly type: StepType = 'branch';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, context } = input;
    const startTime = Date.now();

    if (!step.branches || step.branches.length === 0) {
      throw new BranchResolutionError(`Step "${step.id}" has no branch cases defined`);
    }

    const contextObj = {
      trigger: context.trigger,
      steps: context.steps,
      variables: context.variables,
    };

    let defaultBranch: typeof step.branches[number] | undefined;

    for (const branch of step.branches) {
      // Support a default/fallback branch that fires when no condition matches
      if (branch.when === 'default' || (branch as unknown as Record<string, unknown>).default === true) {
        defaultBranch = branch;
        continue;
      }

      const expression = jsonata(branch.when);
      const result = await expression.evaluate(contextObj);
      if (result === true) {
        const durationMs = Date.now() - startTime;
        return {
          output: { nextStepId: branch.nextStepId },
          logs: [
            {
              level: 'info',
              message: `Branch "${branch.when}" matched, routing to step "${branch.nextStepId}"`,
              timestamp: new Date(),
            },
          ],
          durationMs,
        };
      }
    }

    if (defaultBranch) {
      const durationMs = Date.now() - startTime;
      return {
        output: { nextStepId: defaultBranch.nextStepId },
        logs: [
          {
            level: 'info',
            message: `No branch condition matched, using default branch to step "${defaultBranch.nextStepId}"`,
            timestamp: new Date(),
          },
        ],
        durationMs,
      };
    }

    throw new BranchResolutionError(
      `No branch matched for step "${step.id}" and no default branch defined`
    );
  }
}
