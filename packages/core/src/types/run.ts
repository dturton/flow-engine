export type FlowRunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';

export interface TriggerPayload {
  type: 'webhook' | 'schedule' | 'manual' | 'event';
  data: Record<string, unknown>;
  receivedAt: Date;
}

export interface StepError {
  code: string;
  message: string;
  category: 'network' | 'rateLimit' | 'timeout' | 'serverError' | 'validation' | 'unknown';
  retryable: boolean;
  raw?: unknown;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  meta?: Record<string, unknown>;
}

export interface StepOutput {
  data: Record<string, unknown>;
  completedAt: Date;
  durationMs: number;
}

export interface StepRun {
  stepId: string;
  status: StepRunStatus;
  attempt: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: StepError;
  logs: LogEntry[];
}

export interface FlowRun {
  id: string;
  flowId: string;
  flowVersion: number;
  tenantId: string;
  status: FlowRunStatus;
  trigger: TriggerPayload;
  startedAt: Date;
  completedAt?: Date;
  stepRuns: Record<string, StepRun>;
  error?: { stepId: string; error: StepError; at: Date };
}

export interface FlowContext {
  runId: string;
  flowId: string;
  trigger: TriggerPayload;
  steps: Record<string, StepOutput>;
  variables: Record<string, unknown>;
}
