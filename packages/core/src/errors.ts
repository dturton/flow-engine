export class FlowEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FlowEngineError';
  }
}

export class FlowValidationError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'FLOW_VALIDATION_ERROR');
    this.name = 'FlowValidationError';
  }
}

export class ConnectorNotFoundError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'CONNECTOR_NOT_FOUND');
    this.name = 'ConnectorNotFoundError';
  }
}

export class StepTimeoutError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'STEP_TIMEOUT');
    this.name = 'StepTimeoutError';
  }
}

export class BranchResolutionError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'BRANCH_RESOLUTION_FAILED');
    this.name = 'BranchResolutionError';
  }
}

export class ContextStoreError extends FlowEngineError {
  constructor(message: string) {
    super(message, 'CONTEXT_STORE_ERROR');
    this.name = 'ContextStoreError';
  }
}
