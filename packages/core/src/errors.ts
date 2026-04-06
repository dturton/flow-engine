/**
 * Custom error hierarchy for the flow engine.
 * All errors extend {@link FlowEngineError} and carry a machine-readable `code`
 * so callers can programmatically distinguish failure types.
 */

/** Base error class for all flow engine errors. Carries a machine-readable `code`. */
export class FlowEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FlowEngineError';
  }
}

/** Thrown when a flow definition fails DAG validation (cycles, missing deps, duplicates). */
export class FlowValidationError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'FLOW_VALIDATION_ERROR');
    this.name = 'FlowValidationError';
  }
}

/** Thrown when a step references a connector or connection that cannot be resolved. */
export class ConnectorNotFoundError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'CONNECTOR_NOT_FOUND');
    this.name = 'ConnectorNotFoundError';
  }
}

/** Thrown when a step exceeds its configured or default timeout. */
export class StepTimeoutError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'STEP_TIMEOUT');
    this.name = 'StepTimeoutError';
  }
}

/** Thrown when no branch condition evaluates to true and no default exists. */
export class BranchResolutionError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'BRANCH_RESOLUTION_FAILED');
    this.name = 'BranchResolutionError';
  }
}

/** Thrown on Redis/S3 failures when reading or writing flow execution context. */
export class ContextStoreError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'CONTEXT_STORE_ERROR');
    this.name = 'ContextStoreError';
  }
}
