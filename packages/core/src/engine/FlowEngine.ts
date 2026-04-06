import type { FlowDefinition } from '../types/flow.js';
import type {
  FlowRun,
  FlowRunStatus,
  StepRun,
  StepRunStatus,
  TriggerPayload,
  FlowContext,
  StepError,
  LogEntry,
  StepOutput,
} from '../types/run.js';
import type { RetryPolicy, StepDefinition } from '../types/flow.js';
import type { ExecutionGraph } from './DagResolver.js';
import type { DagResolver } from './DagResolver.js';
import type { StepExecutorRegistry, InputResolver } from './StepExecutor.js';
import type { ContextStore } from './ContextStore.js';
import type { RetryManager } from './RetryManager.js';
import type { FlowRunRepository } from '../persistence/FlowRunRepository.js';
import { StepTimeoutError } from '../errors.js';

export interface FlowEngineOptions {
  maxConcurrentSteps: number;
  defaultRetryPolicy: RetryPolicy;
  stepTimeoutMs: number;
}

const DEFAULT_OPTIONS: FlowEngineOptions = {
  maxConcurrentSteps: 5,
  defaultRetryPolicy: {
    maxAttempts: 3,
    strategy: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    retryableErrors: ['network', 'rateLimit', 'timeout', 'serverError'],
  },
  stepTimeoutMs: 30_000,
};

export class FlowEngine {
  private options: FlowEngineOptions;
  private cancelledRuns = new Set<string>();

  constructor(
    private dagResolver: DagResolver,
    private executorRegistry: StepExecutorRegistry,
    private contextStore: ContextStore,
    private inputResolver: InputResolver,
    private retryManager: RetryManager,
    private runRepository: FlowRunRepository,
    options?: Partial<FlowEngineOptions>
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute(flow: FlowDefinition, trigger: TriggerPayload): Promise<FlowRun> {
    const graph = this.dagResolver.resolve(flow);
    const runId = crypto.randomUUID();

    const run: FlowRun = {
      id: runId,
      flowId: flow.id,
      flowVersion: flow.version,
      tenantId: flow.tenantId,
      status: 'queued',
      trigger,
      startedAt: new Date(),
      stepRuns: {},
    };

    await this.runRepository.create(run);

    try {
      run.status = 'running';
      await this.runRepository.updateStatus(runId, 'running');
      await this.contextStore.init(runId, trigger, flow.id);
      await this.runLoop(run, flow, graph);
    } finally {
      await this.contextStore.release(runId).catch(() => {});
    }

    return run;
  }

  async resume(runId: string, flow: FlowDefinition, fromStepId?: string): Promise<FlowRun> {
    const run = await this.runRepository.findById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const graph = this.dagResolver.resolve(flow);
    run.status = 'running';
    await this.runRepository.updateStatus(runId, 'running');

    if (fromStepId) {
      // Remove the specified step and all its dependents so they can be re-queued
      const dependents = this.getAllDependents(fromStepId, graph);
      for (const stepId of [fromStepId, ...dependents]) {
        delete run.stepRuns[stepId];
      }
    }

    try {
      await this.runLoop(run, flow, graph);
    } finally {
      await this.contextStore.release(runId).catch(() => {});
    }

    return run;
  }

  async cancel(runId: string): Promise<void> {
    this.cancelledRuns.add(runId);
    await this.runRepository.updateStatus(runId, 'cancelled');
  }

  private async runLoop(run: FlowRun, flow: FlowDefinition, graph: ExecutionGraph): Promise<void> {
    while (true) {
      if (this.cancelledRuns.has(run.id)) {
        run.status = 'cancelled';
        await this.runRepository.updateStatus(run.id, 'cancelled');
        return;
      }

      const readySteps = this.getReadySteps(run, flow, graph);
      if (readySteps.length === 0) break;

      // Dispatch up to maxConcurrentSteps in parallel
      const batch = readySteps.slice(0, this.options.maxConcurrentSteps);
      const context = await this.contextStore.get(run.id);

      const results = await Promise.allSettled(
        batch.map((step) => this.executeStep(run, flow, step, context))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const step = batch[i];

        if (result.status === 'fulfilled') {
          const stepRun = result.value;
          run.stepRuns[step.id] = stepRun;
          await this.runRepository.upsertStepRun(run.id, stepRun);

          if (stepRun.status === 'failed') {
            await this.handleStepFailure(run, flow, stepRun);
            if (run.status === 'failed') return;
          }
        } else {
          // Unexpected rejection — treat as step failure
          const stepRun: StepRun = {
            stepId: step.id,
            status: 'failed',
            attempt: 1,
            startedAt: new Date(),
            completedAt: new Date(),
            input: {},
            error: {
              code: 'UNEXPECTED_ERROR',
              message: result.reason instanceof Error ? result.reason.message : String(result.reason),
              category: 'unknown',
              retryable: false,
            },
            logs: [],
          };
          run.stepRuns[step.id] = stepRun;
          await this.runRepository.upsertStepRun(run.id, stepRun);
          await this.handleStepFailure(run, flow, stepRun);
          if (run.status === 'failed') return;
        }
      }
    }

    // Determine final status
    if (run.status !== 'failed' && run.status !== 'cancelled') {
      const hasFailedSteps = Object.values(run.stepRuns).some((sr) => sr.status === 'failed');
      run.status = hasFailedSteps ? 'completed' : 'completed';
      run.completedAt = new Date();
      await this.runRepository.updateStatus(run.id, run.status, run.completedAt);
    }
  }

  private getReadySteps(run: FlowRun, flow: FlowDefinition, graph: ExecutionGraph): StepDefinition[] {
    const completedStepIds = new Set<string>();
    const failedStepIds = new Set<string>();
    const startedStepIds = new Set<string>();

    for (const [stepId, stepRun] of Object.entries(run.stepRuns)) {
      startedStepIds.add(stepId);
      if (stepRun.status === 'completed') {
        completedStepIds.add(stepId);
      } else if (stepRun.status === 'failed') {
        failedStepIds.add(stepId);
        // If continueOnError, treat as "completed" for dependency resolution
        const stepDef = flow.steps.find((s) => s.id === stepId);
        if (stepDef?.continueOnError || flow.errorPolicy.onStepFailure === 'continue') {
          completedStepIds.add(stepId);
        }
      }
    }

    const ready: StepDefinition[] = [];
    for (const step of flow.steps) {
      if (startedStepIds.has(step.id)) continue;
      const allDepsResolved = step.dependsOn.every((dep) => completedStepIds.has(dep));
      if (allDepsResolved) {
        ready.push(step);
      }
    }

    return ready;
  }

  private async executeStep(
    run: FlowRun,
    flow: FlowDefinition,
    step: StepDefinition,
    context: FlowContext
  ): Promise<StepRun> {
    const retryPolicy = step.retryPolicy ?? this.options.defaultRetryPolicy;
    const timeoutMs = step.timeoutMs ?? this.options.stepTimeoutMs;
    let attempt = 0;

    const logs: LogEntry[] = [];
    const log = (level: LogEntry['level'], message: string, meta?: Record<string, unknown>) => {
      logs.push({ level, message, timestamp: new Date(), meta });
    };

    while (true) {
      attempt++;
      const startedAt = new Date();

      log('info', `Step "${step.id}" starting (attempt ${attempt})`, {
        runId: run.id,
        stepId: step.id,
        attempt,
      });

      try {
        // Re-resolve inputs each attempt (credentials may have refreshed)
        const freshContext = attempt > 1 ? await this.contextStore.get(run.id) : context;
        const resolvedInputs = await this.inputResolver.resolve(step.inputMapping, freshContext);

        // Execute with timeout
        const executionPromise = this.executorRegistry.execute(step.type, {
          step,
          resolvedInputs,
          context: freshContext,
          attempt,
          tenantId: run.tenantId,
          flowFunctions: flow.functions,
        });

        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new StepTimeoutError(`Step "${step.id}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        });

        const result = await Promise.race([executionPromise, timeoutPromise]);
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();

        log('info', `Step "${step.id}" completed`, {
          runId: run.id,
          stepId: step.id,
          attempt,
          durationMs,
        });

        // Commit output to context store
        const stepOutput: StepOutput = {
          data: result.output,
          completedAt,
          durationMs,
        };
        await this.contextStore.commitStepOutput(run.id, step.id, stepOutput);

        return {
          stepId: step.id,
          status: 'completed' as StepRunStatus,
          attempt,
          startedAt,
          completedAt,
          durationMs,
          input: resolvedInputs,
          output: result.output,
          logs: [...logs, ...result.logs],
        };
      } catch (err) {
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        const stepError = this.toStepError(err);

        log('error', `Step "${step.id}" failed (attempt ${attempt}): ${stepError.message}`, {
          runId: run.id,
          stepId: step.id,
          attempt,
          durationMs,
        });

        if (this.retryManager.shouldRetry(stepError, retryPolicy, attempt)) {
          const delayMs = this.retryManager.getDelayMs(retryPolicy, attempt);
          log('info', `Retrying step "${step.id}" in ${delayMs}ms`, {
            runId: run.id,
            stepId: step.id,
            attempt,
          });
          await this.delay(delayMs);
          continue;
        }

        // Permanent failure
        return {
          stepId: step.id,
          status: 'failed' as StepRunStatus,
          attempt,
          startedAt,
          completedAt,
          durationMs,
          input: {},
          error: stepError,
          logs,
        };
      }
    }
  }

  private async handleStepFailure(run: FlowRun, flow: FlowDefinition, stepRun: StepRun): Promise<void> {
    const policy = flow.errorPolicy;

    switch (policy.onStepFailure) {
      case 'halt':
        run.status = 'failed';
        run.completedAt = new Date();
        run.error = {
          stepId: stepRun.stepId,
          error: stepRun.error!,
          at: new Date(),
        };
        await this.runRepository.updateStatus(run.id, 'failed', run.completedAt);
        break;

      case 'continue':
        // Step is already marked failed; runLoop continues
        break;

      case 'goto':
        if (policy.errorStepId) {
          // Remove the error step from stepRuns so it can be re-queued
          delete run.stepRuns[policy.errorStepId];
        }
        break;
    }
  }

  private getAllDependents(stepId: string, graph: ExecutionGraph): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const queue = [stepId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.nodes.get(current);
      if (!node) continue;

      for (const dep of node.dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          result.push(dep);
          queue.push(dep);
        }
      }
    }

    return result;
  }

  private toStepError(err: unknown): StepError {
    if (err instanceof StepTimeoutError) {
      return {
        code: 'STEP_TIMEOUT',
        message: err.message,
        category: 'timeout',
        retryable: true,
      };
    }

    const error = err instanceof Error ? err : new Error(String(err));
    return {
      code: 'STEP_EXECUTION_ERROR',
      message: error.message,
      category: 'unknown',
      retryable: false,
      raw: err,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
