import { describe, it, expect } from 'vitest';
import { classifyHttpError, ConnectorApiError } from '../src/base/error-classifier.js';

describe('classifyHttpError', () => {
  it('classifies 429 as rateLimit and retryable', () => {
    const err = classifyHttpError(429, 'rate limited', '/api/products');
    expect(err.statusCode).toBe(429);
    expect(err.category).toBe('rateLimit');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('/api/products');
  });

  it('classifies 408 as timeout and retryable', () => {
    const err = classifyHttpError(408, 'timeout', '/api/orders');
    expect(err.statusCode).toBe(408);
    expect(err.category).toBe('timeout');
    expect(err.retryable).toBe(true);
  });

  it('classifies 500 as serverError and retryable', () => {
    const err = classifyHttpError(500, 'internal error', '/api/data');
    expect(err.statusCode).toBe(500);
    expect(err.category).toBe('serverError');
    expect(err.retryable).toBe(true);
  });

  it('classifies 502 as serverError and retryable', () => {
    const err = classifyHttpError(502, 'bad gateway', '/api/data');
    expect(err.category).toBe('serverError');
    expect(err.retryable).toBe(true);
  });

  it('classifies 503 as serverError and retryable', () => {
    const err = classifyHttpError(503, 'unavailable', '/api/data');
    expect(err.category).toBe('serverError');
    expect(err.retryable).toBe(true);
  });

  it('classifies 400 as validation and not retryable', () => {
    const err = classifyHttpError(400, 'bad request', '/api/items');
    expect(err.statusCode).toBe(400);
    expect(err.category).toBe('validation');
    expect(err.retryable).toBe(false);
  });

  it('classifies 401 as validation and not retryable', () => {
    const err = classifyHttpError(401, 'unauthorized', '/api/secret');
    expect(err.category).toBe('validation');
    expect(err.retryable).toBe(false);
  });

  it('classifies 404 as validation and not retryable', () => {
    const err = classifyHttpError(404, 'not found', '/api/missing');
    expect(err.category).toBe('validation');
    expect(err.retryable).toBe(false);
  });

  it('classifies unexpected status (e.g. 301) as unknown and not retryable', () => {
    const err = classifyHttpError(301, 'redirect', '/api/old');
    expect(err.category).toBe('unknown');
    expect(err.retryable).toBe(false);
  });

  it('stores the response body on the error', () => {
    const body = '{"error":"rate limited"}';
    const err = classifyHttpError(429, body, '/api/test');
    expect(err.responseBody).toBe(body);
  });

  it('returns a ConnectorApiError instance', () => {
    const err = classifyHttpError(500, 'err', '/');
    expect(err).toBeInstanceOf(ConnectorApiError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ConnectorApiError.toStepError', () => {
  it('converts to a StepError with HTTP_ prefixed code', () => {
    const err = classifyHttpError(429, 'rate limited', '/api/products');
    const stepError = err.toStepError();

    expect(stepError.code).toBe('HTTP_429');
    expect(stepError.message).toContain('Rate limited');
    expect(stepError.category).toBe('rateLimit');
    expect(stepError.retryable).toBe(true);
    expect(stepError.raw).toBe('rate limited');
  });

  it('converts a 400 error correctly', () => {
    const err = classifyHttpError(400, 'bad input', '/api/create');
    const stepError = err.toStepError();

    expect(stepError.code).toBe('HTTP_400');
    expect(stepError.category).toBe('validation');
    expect(stepError.retryable).toBe(false);
  });
});
