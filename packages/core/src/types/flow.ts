/**
 * Type definitions for flow definitions — the static, declarative description
 * of a flow's steps, their dependencies, input/output mappings, and error policies.
 */

/** Discriminated union of supported step types dispatched by {@link StepExecutorRegistry}. */
export type StepType = 'action' | 'transform' | 'branch' | 'loop' | 'delay' | 'script';

/** A reusable function defined at the flow level and injected into script step sandboxes. */
export interface FlowFunction {
  name: string;
  params: string[];
  /** Raw JavaScript function body (no surrounding `function` wrapper). */
  body: string;
}

/** An input mapping expression that resolves a value from the flow context at runtime. */
export interface MappingExpression {
  /** Resolution strategy: JSONPath query, JSONata expression, literal string, or template interpolation. */
  type: 'jsonpath' | 'jsonata' | 'literal' | 'template';
  value: string;
}

/** Configures how a failed step is retried, including backoff strategy and eligible error categories. */
export interface RetryPolicy {
  maxAttempts: number;
  strategy: 'fixed' | 'exponential' | 'jitter';
  initialDelayMs: number;
  maxDelayMs: number;
  /** Error categories eligible for retry; others are treated as permanent failures. */
  retryableErrors: Array<'network' | 'rateLimit' | 'timeout' | 'serverError'>;
}

/** A single condition-based routing case within a branch step. */
export interface BranchCase {
  /** JSONata expression that must evaluate to `true` for this branch to match. */
  when: string;
  nextStepId: string;
}

/** Defines a single step within a flow, including its type, dependencies, and execution configuration. */
export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  /** Key to look up a connector in the registry (e.g. "http", "shopify"). */
  connectorKey?: string;
  /** Reference to a stored Connection record for credential-based connector resolution. */
  connectionId?: string;
  /** Operation to invoke on the connector (e.g. "products.list"). */
  operationId?: string;
  /** Maps step input keys to expressions resolved from the flow context. */
  inputMapping: Record<string, MappingExpression | string>;
  outputMapping?: Record<string, string>;
  /** Step IDs that must complete before this step can execute. */
  dependsOn: string[];
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  /** When true, a failure in this step does not halt the run (subject to error policy). */
  continueOnError?: boolean;
  /** Conditional routing cases for branch-type steps. */
  branches?: BranchCase[];
  /** JSONPath expression selecting the array to iterate over for loop-type steps. */
  loopOver?: string;
}

/** Flow-level error handling policy applied when any step fails. */
export interface FlowErrorPolicy {
  onStepFailure: 'halt' | 'continue' | 'goto';
  /** Target step for the 'goto' strategy. */
  errorStepId?: string;
}

/** The complete, versioned definition of a flow including its steps and metadata. */
export interface FlowDefinition {
  id: string;
  version: number;
  name: string;
  description?: string;
  tenantId: string;
  steps: StepDefinition[];
  /** Reusable functions available to script steps within this flow. */
  functions?: FlowFunction[];
  errorPolicy: FlowErrorPolicy;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}
