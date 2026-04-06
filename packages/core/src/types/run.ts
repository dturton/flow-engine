/**
 * Type definitions for flow execution runtime state — runs, step runs,
 * trigger payloads, errors, logs, and the in-flight flow context.
 */

/** Lifecycle status of an entire flow run. */
export type FlowRunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Lifecycle status of an individual step within a run. */
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';

/** The event that initiated a flow run. */
export interface TriggerPayload {
  type: 'webhook' | 'schedule' | 'manual' | 'event';
  data: Record<string, unknown>;
  receivedAt: Date;
}

/** Structured error captured when a step fails, used for retry decisions and diagnostics. */
export interface StepError {
  code: string;
  message: string;
  /** Classification used by {@link RetryManager} to decide if the error is retryable. */
  category: 'network' | 'rateLimit' | 'timeout' | 'serverError' | 'validation' | 'unknown';
  retryable: boolean;
  /** Original error object or response body for debugging. */
  raw?: unknown;
}

/** A single log entry emitted during step execution. */
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  meta?: Record<string, unknown>;
}

/** The data produced by a successfully completed step, stored in the context. */
export interface StepOutput {
  data: Record<string, unknown>;
  completedAt: Date;
  durationMs: number;
}

/** Runtime state of a single step execution, including all retry attempts. */
export interface StepRun {
  stepId: string;
  status: StepRunStatus;
  /** Current attempt number (1-based). */
  attempt: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: StepError;
  logs: LogEntry[];
}

/** Top-level record for a flow execution, aggregating all step runs. */
export interface FlowRun {
  id: string;
  flowId: string;
  flowVersion: number;
  tenantId: string;
  status: FlowRunStatus;
  trigger: TriggerPayload;
  startedAt: Date;
  completedAt?: Date;
  /** Keyed by step ID for O(1) lookup during execution. */
  stepRuns: Record<string, StepRun>;
  /** Populated when the run fails due to a step error (with 'halt' policy). */
  error?: { stepId: string; error: StepError; at: Date };
}

/**
 * In-flight execution context passed between steps. Stored in Redis and used
 * by {@link InputResolver} to evaluate mapping expressions.
 */
export interface FlowContext {
  runId: string;
  flowId: string;
  trigger: TriggerPayload;
  /** Accumulated outputs from completed steps, keyed by step ID. */
  steps: Record<string, StepOutput>;
  /** Arbitrary key-value store for cross-step state (e.g. set by script steps). */
  variables: Record<string, unknown>;
}
