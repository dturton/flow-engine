import jsonata from 'jsonata';
import { JSONPath } from 'jsonpath-plus';
import type { StepType, StepDefinition, MappingExpression } from '../types/flow.js';
import type { FlowContext, LogEntry } from '../types/run.js';
import type { ValidationIssue } from './DagResolver.js';

export interface StepExecutionInput {
  step: StepDefinition;
  resolvedInputs: Record<string, unknown>;
  context: FlowContext;
  attempt: number;
}

export interface StepExecutionResult {
  output: Record<string, unknown>;
  logs: LogEntry[];
  durationMs: number;
}

export interface StepExecutor {
  readonly type: StepType;
  execute(input: StepExecutionInput): Promise<StepExecutionResult>;
  validate?(step: StepDefinition): ValidationIssue[];
}

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

export class InputResolver {
  resolve(
    mapping: StepDefinition['inputMapping'],
    context: FlowContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, expr] of Object.entries(mapping)) {
      if (typeof expr === 'string') {
        resolved[key] = expr;
      } else {
        resolved[key] = this.evaluateExpression(expr, context);
      }
    }

    return resolved;
  }

  private evaluateExpression(expr: MappingExpression, context: FlowContext): unknown {
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
        // jsonata's evaluate is synchronous when no async bindings are used
        return (expression.evaluate as (data: unknown) => unknown)(contextObj);
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
