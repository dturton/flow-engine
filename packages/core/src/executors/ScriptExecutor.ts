/**
 * Script step executor — runs user-provided JavaScript in a Node.js `vm` sandbox
 * with a 5-second timeout. The sandbox exposes `inputs`, `context`, and `output`
 * but blocks access to Node.js internals (require, process, fs, etc.).
 * Flow-level functions are prepended to the script as top-level declarations.
 *
 * NOTE: Node.js `vm` is NOT a true security sandbox. For production use with
 * untrusted code, replace with `isolated-vm` or `quickjs-emscripten`.
 */

import vm from 'node:vm';
import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';
import { FlowValidationError } from '../errors.js';

/** Hard timeout for sandboxed script execution to prevent runaway loops. */
const SCRIPT_TIMEOUT_MS = 5000;

/** Maximum serialized output size (1 MB). */
const MAX_OUTPUT_SIZE_BYTES = 1_048_576;

/** Valid JavaScript identifier pattern for flow function names and params. */
const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Creates a frozen, prototype-chain-hardened copy of a value for the sandbox.
 * Getters on `__proto__`, `constructor`, and `prototype` throw to block
 * escape attempts like `this.constructor.constructor('return process')()`.
 */
function hardenObject(obj: Record<string, unknown>): Record<string, unknown> {
  const hardened = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    hardened[key] = value;
  }
  Object.defineProperties(hardened, {
    __proto__: { get() { throw new Error('Access to __proto__ is blocked'); }, configurable: false },
    constructor: { get() { throw new Error('Access to constructor is blocked'); }, configurable: false },
    prototype: { get() { throw new Error('Access to prototype is blocked'); }, configurable: false },
  });
  Object.freeze(hardened);
  return hardened;
}

/**
 * Executes arbitrary JavaScript in a V8 sandbox. Scripts set `output` to
 * return data. Node.js globals are explicitly blocked for security.
 */
export class ScriptExecutor implements StepExecutor {
  readonly type: StepType = 'script';

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, resolvedInputs, context } = input;
    const startTime = Date.now();

    const script = resolvedInputs.script;
    if (typeof script !== 'string') {
      throw new Error(`Step "${step.id}": script input must be a string`);
    }

    // Validate flow function identifiers before injecting into script
    const fnDefs = input.flowFunctions ?? [];
    for (const fn of fnDefs) {
      if (!IDENTIFIER_RE.test(fn.name)) {
        throw new FlowValidationError(
          `Invalid flow function name "${fn.name}": must be a valid JavaScript identifier`
        );
      }
      for (const param of fn.params) {
        if (!IDENTIFIER_RE.test(param)) {
          throw new FlowValidationError(
            `Invalid parameter "${param}" in flow function "${fn.name}": must be a valid JavaScript identifier`
          );
        }
      }
    }

    const sandbox: Record<string, unknown> = {
      inputs: hardenObject({ ...resolvedInputs }),
      context: hardenObject({
        trigger: context.trigger,
        steps: context.steps,
        variables: context.variables,
      }),
      output: undefined,
      console: Object.freeze({
        log: () => {},
        error: () => {},
        warn: () => {},
      }),
      // Explicitly block access to Node.js internals
      require: undefined,
      process: undefined,
      fs: undefined,
      child_process: undefined,
      global: undefined,
      globalThis: undefined,
    };

    // Prepend flow-level function declarations so scripts can call them
    const preamble = fnDefs
      .map(fn => `function ${fn.name}(${fn.params.join(', ')}) { ${fn.body} }`)
      .join('\n');
    const fullScript = preamble ? preamble + '\n' + script : script;

    // Use runInNewContext with a completely fresh context to avoid shared references
    const vmScript = new vm.Script(fullScript, { filename: `step-${step.id}.js` });

    vmScript.runInNewContext(sandbox, {
      timeout: SCRIPT_TIMEOUT_MS,
      microtaskMode: 'afterEvaluate',
    });

    // Validate output size
    const rawOutput = sandbox.output;
    const serialized = JSON.stringify(rawOutput);
    if (serialized && serialized.length > MAX_OUTPUT_SIZE_BYTES) {
      throw new Error(
        `Step "${step.id}": script output exceeds maximum size of ${MAX_OUTPUT_SIZE_BYTES} bytes`
      );
    }

    const output =
      rawOutput != null && typeof rawOutput === 'object'
        ? (rawOutput as Record<string, unknown>)
        : { result: rawOutput };

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
