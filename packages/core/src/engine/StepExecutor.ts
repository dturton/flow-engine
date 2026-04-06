/**
 * Step executor abstraction and input resolution layer. Defines the
 * {@link StepExecutor} interface, a registry for type-specific executors,
 * and {@link InputResolver} which evaluates JSONPath, JSONata, literal,
 * and template expressions against the flow context.
 */

import jsonata from 'jsonata';
import { JSONPath } from 'jsonpath-plus';
import type { StepType, StepDefinition, MappingExpression, FlowFunction } from '../types/flow.js';
import type { FlowContext, LogEntry } from '../types/run.js';
import type { ValidationIssue } from './DagResolver.js';

/** Input bundle passed to every step executor. */
export interface StepExecutionInput {
  step: StepDefinition;
  resolvedInputs: Record<string, unknown>;
  context: FlowContext;
  /** Current retry attempt (1-based). */
  attempt: number;
  tenantId: string;
  /** Flow-level reusable functions available to script executors. */
  flowFunctions?: FlowFunction[];
}

/** The result returned by a step executor after successful execution. */
export interface StepExecutionResult {
  output: Record<string, unknown>;
  logs: LogEntry[];
  durationMs: number;
}

/** Contract for a type-specific step executor (action, transform, branch, etc.). */
export interface StepExecutor {
  readonly type: StepType;
  execute(input: StepExecutionInput): Promise<StepExecutionResult>;
  /** Optional static validation of a step definition before execution. */
  validate?(step: StepDefinition): ValidationIssue[];
}

/** Registry that maps step types to their executor implementations. */
export class StepExecutorRegistry {
  private executors = new Map<StepType, StepExecutor>();

  register(executor: StepExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: StepType): StepExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for step type: ${type}`);
    }
    return executor;
  }

  execute(type: StepType, input: StepExecutionInput): Promise<StepExecutionResult> {
    return this.get(type).execute(input);
  }
}

/**
 * Resolves a step's input mapping expressions against the current flow context.
 * Supports four expression types: literal, JSONata, JSONPath, and mustache-style templates.
 */
export class InputResolver {
  async resolve(
    mapping: StepDefinition['inputMapping'],
    context: FlowContext
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};

    for (const [key, expr] of Object.entries(mapping)) {
      if (typeof expr === 'string') {
        resolved[key] = expr;
      } else {
        resolved[key] = await this.evaluateExpression(expr, context);
      }
    }

    return resolved;
  }

  private async evaluateExpression(expr: MappingExpression, context: FlowContext): Promise<unknown> {
    const contextObj = {
      trigger: context.trigger,
      steps: context.steps,
      variables: context.variables,
    };

    switch (expr.type) {
      case 'literal':
        return expr.value;

      case 'jsonata': {
        const expression = jsonata(expr.value);
        // jsonata's evaluate is async in v2.x
        return await expression.evaluate(contextObj);
      }

      case 'jsonpath': {
        const results = JSONPath({ path: expr.value, json: contextObj });
        return results.length === 1 ? results[0] : results;
      }

      case 'template': {
        return expr.value.replace(/\{\{(.+?)\}\}/g, (_match, path: string) => {
          const parts = path.trim().split('.');
          let current: unknown = contextObj;
          for (const part of parts) {
            if (current == null || typeof current !== 'object') return '';
            current = (current as Record<string, unknown>)[part];
          }
          return current != null ? String(current) : '';
        });
      }

      default:
        throw new Error(`Unknown expression type: ${(expr as MappingExpression).type}`);
    }
  }
}
