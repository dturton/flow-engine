/**
 * Loop step executor — iterates over an array selected by a JSONPath expression
 * from the flow context and produces an output containing each item with its index.
 */

import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';
import type { LogEntry } from '../types/run.js';
import { JSONPath } from 'jsonpath-plus';

/**
 * Resolves the `loopOver` JSONPath against the context, fans out each item
 * into an iteration record, and returns the full iteration array as output.
 */
export class LoopExecutor implements StepExecutor {
  readonly type: StepType = 'loop';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, resolvedInputs, context } = input;
    const startTime = Date.now();
    const logs: LogEntry[] = [];

    const loopPath = step.loopOver;
    if (!loopPath) {
      throw new Error(`Loop step "${step.id}" has no loopOver path`);
    }

    const contextObj = { trigger: context.trigger, steps: context.steps, variables: context.variables };
    const results = JSONPath({ path: loopPath, json: contextObj, wrap: false });
    const items = Array.isArray(results) ? results : [results];

    logs.push({
      level: 'info',
      message: `Loop step "${step.id}" iterating over ${items.length} items`,
      timestamp: new Date(),
    });

    // Collect resolved inputs for each iteration
    const iterations: Record<string, unknown>[] = [];
    for (let i = 0; i < items.length; i++) {
      iterations.push({
        index: i,
        item: items[i],
        ...resolvedInputs,
      });
    }

    const durationMs = Date.now() - startTime;

    return {
      output: { items: iterations, count: items.length },
      logs,
      durationMs,
    };
  }
}
