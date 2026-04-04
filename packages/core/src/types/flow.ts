export type StepType = 'action' | 'transform' | 'branch' | 'loop' | 'delay' | 'script';

export interface MappingExpression {
  type: 'jsonpath' | 'jsonata' | 'literal' | 'template';
  value: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  strategy: 'fixed' | 'exponential' | 'jitter';
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors: Array<'network' | 'rateLimit' | 'timeout' | 'serverError'>;
}

export interface BranchCase {
  when: string;
  nextStepId: string;
}

export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  connectorKey?: string;
  connectionId?: string;
  operationId?: string;
  inputMapping: Record<string, MappingExpression | string>;
  outputMapping?: Record<string, string>;
  dependsOn: string[];
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  continueOnError?: boolean;
  branches?: BranchCase[];
  loopOver?: string;
}

export interface FlowErrorPolicy {
  onStepFailure: 'halt' | 'continue' | 'goto';
  errorStepId?: string;
}

export interface FlowDefinition {
  id: string;
  version: number;
  name: string;
  description?: string;
  tenantId: string;
  steps: StepDefinition[];
  errorPolicy: FlowErrorPolicy;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}
