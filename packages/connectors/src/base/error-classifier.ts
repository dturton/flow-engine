import type { StepError } from '@flow-engine/core';

export class ConnectorApiError extends Error {
  readonly name = 'ConnectorApiError';

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly category: StepError['category'],
    public readonly retryable: boolean,
    public readonly responseBody?: string,
  ) {
    super(message);
  }

  toStepError(): StepError {
    return {
      code: `HTTP_${this.statusCode}`,
      message: this.message,
      category: this.category,
      retryable: this.retryable,
      raw: this.responseBody,
    };
  }
}

export function classifyHttpError(
  status: number,
  body: string,
  path: string,
): ConnectorApiError {
  if (status === 429) {
    return new ConnectorApiError(`Rate limited on ${path}`, status, 'rateLimit', true, body);
  }
  if (status === 408) {
    return new ConnectorApiError(`Timeout on ${path}`, status, 'timeout', true, body);
  }
  if (status >= 500) {
    return new ConnectorApiError(`Server error ${status} on ${path}`, status, 'serverError', true, body);
  }
  if (status >= 400) {
    return new ConnectorApiError(`Client error ${status} on ${path}`, status, 'validation', false, body);
  }
  return new ConnectorApiError(`Unexpected HTTP ${status} on ${path}`, status, 'unknown', false, body);
}
