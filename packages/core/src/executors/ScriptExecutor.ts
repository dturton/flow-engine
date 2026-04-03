import vm from 'node:vm';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';

const SCRIPT_TIMEOUT_MS = 5000;

export class ScriptExecutor implements StepExecutor {
  readonly type: StepType = 'script';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, resolvedInputs, context } = input;
    const startTime = Date.now();

    const script = resolvedInputs.script;
    if (typeof script !== 'string') {
      throw new Error(`Step "${step.id}": script input must be a string`);
    }

    const sandbox: Record<string, unknown> = {
      inputs: { ...resolvedInputs },
      context: {
        trigger: context.trigger,
        steps: context.steps,
        variables: context.variables,
      },
      output: undefined,
      console: {
        log: () => {},
        error: () => {},
        warn: () => {},
      },
      // Explicitly block access to Node.js internals
      require: undefined,
      process: undefined,
      fs: undefined,
      child_process: undefined,
      global: undefined,
      globalThis: undefined,
    };

    const vmContext = vm.createContext(sandbox);
    const vmScript = new vm.Script(script, { filename: `step-${step.id}.js` });

    vmScript.runInContext(vmContext, { timeout: SCRIPT_TIMEOUT_MS });

    const output =
      sandbox.output != null && typeof sandbox.output === 'object'
        ? (sandbox.output as Record<string, unknown>)
        : { result: sandbox.output };

    const durationMs = Date.now() - startTime;

    return {
      output,
      logs: [
        {
          level: 'info',
          message: `Script step "${step.id}" executed`,
          timestamp: new Date(),
        },
      ],
      durationMs,
    };
  }
}
