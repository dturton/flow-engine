import { describe, it, expect } from 'vitest';
import {
  FlowEngineError,
  FlowValidationError,
  ConnectorNotFoundError,
  StepTimeoutError,
  BranchResolutionError,
  ContextStoreError,
} from '../src/errors.js';

describe('Error hierarchy', () => {
  describe('FlowEngineError', () => {
    it('is an instance of Error', () => {
      const err = new FlowEngineError('base error', 'BASE');
      expect(err).toBeInstanceOf(Error);
    });

    it('sets message and code', () => {
      const err = new FlowEngineError('something went wrong', 'MY_CODE');
      expect(err.message).toBe('something went wrong');
      expect(err.code).toBe('MY_CODE');
    });

    it('has name "FlowEngineError"', () => {
      const err = new FlowEngineError('msg', 'CODE');
      expect(err.name).toBe('FlowEngineError');
    });
  });

  describe('FlowValidationError', () => {
    it('is an instance of FlowEngineError and Error', () => {
      const err = new FlowValidationError('invalid flow');
      expect(err).toBeInstanceOf(FlowEngineError);
      expect(err).toBeInstanceOf(Error);
    });

    it('has code "FLOW_VALIDATION_ERROR"', () => {
      const err = new FlowValidationError('invalid flow');
      expect(err.code).toBe('FLOW_VALIDATION_ERROR');
    });

    it('has name "FlowValidationError"', () => {
      const err = new FlowValidationError('invalid flow');
      expect(err.name).toBe('FlowValidationError');
    });

    it('sets the message correctly', () => {
      const err = new FlowValidationError('cycle detected');
      expect(err.message).toBe('cycle detected');
    });
  });

  describe('ConnectorNotFoundError', () => {
    it('is an instance of FlowEngineError', () => {
      const err = new ConnectorNotFoundError('no connector');
      expect(err).toBeInstanceOf(FlowEngineError);
    });

    it('has code "CONNECTOR_NOT_FOUND"', () => {
      const err = new ConnectorNotFoundError('no connector');
      expect(err.code).toBe('CONNECTOR_NOT_FOUND');
    });

    it('has name "ConnectorNotFoundError"', () => {
      const err = new ConnectorNotFoundError('no connector');
      expect(err.name).toBe('ConnectorNotFoundError');
    });
  });

  describe('StepTimeoutError', () => {
    it('is an instance of FlowEngineError', () => {
      const err = new StepTimeoutError('step timed out');
      expect(err).toBeInstanceOf(FlowEngineError);
    });

    it('has code "STEP_TIMEOUT"', () => {
      const err = new StepTimeoutError('step timed out');
      expect(err.code).toBe('STEP_TIMEOUT');
    });

    it('has name "StepTimeoutError"', () => {
      const err = new StepTimeoutError('step timed out');
      expect(err.name).toBe('StepTimeoutError');
    });
  });

  describe('BranchResolutionError', () => {
    it('is an instance of FlowEngineError', () => {
      const err = new BranchResolutionError('no branch matched');
      expect(err).toBeInstanceOf(FlowEngineError);
    });

    it('has code "BRANCH_RESOLUTION_FAILED"', () => {
      const err = new BranchResolutionError('no branch matched');
      expect(err.code).toBe('BRANCH_RESOLUTION_FAILED');
    });

    it('has name "BranchResolutionError"', () => {
      const err = new BranchResolutionError('no branch matched');
      expect(err.name).toBe('BranchResolutionError');
    });
  });

  describe('ContextStoreError', () => {
    it('is an instance of FlowEngineError', () => {
      const err = new ContextStoreError('context lost');
      expect(err).toBeInstanceOf(FlowEngineError);
    });

    it('has code "CONTEXT_STORE_ERROR"', () => {
      const err = new ContextStoreError('context lost');
      expect(err.code).toBe('CONTEXT_STORE_ERROR');
    });

    it('has name "ContextStoreError"', () => {
      const err = new ContextStoreError('context lost');
      expect(err.name).toBe('ContextStoreError');
    });
  });

  it('all subclasses can be caught as FlowEngineError', () => {
    const errors = [
      new FlowValidationError('a'),
      new ConnectorNotFoundError('b'),
      new StepTimeoutError('c'),
      new BranchResolutionError('d'),
      new ContextStoreError('e'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(FlowEngineError);
    }
  });
});
