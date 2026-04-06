/**
 * Abstract base class for all connectors. Provides operation dispatch,
 * authenticated HTTP access, and optional rate limiting. Subclasses
 * implement {@link registerOperations} to wire up their operation handlers.
 */

import type { Connector } from '@flow-engine/core';
import type { OperationHandler, HttpConnectorConfig } from './types.js';
import { AuthenticatedHttpClient } from './AuthenticatedHttpClient.js';
import { RateLimiter } from './RateLimiter.js';

/**
 * Abstract base for connectors that talk to HTTP APIs.
 *
 * Subclasses call {@link registerOperation} inside {@link registerOperations}
 * to declare what operations they support. At runtime, {@link execute} looks
 * up the handler by operation ID, optionally rate-limits, then delegates.
 */
export abstract class BaseConnector implements Connector {
  protected readonly operations = new Map<string, OperationHandler>();
  protected readonly http: AuthenticatedHttpClient;
  protected readonly rateLimiter?: RateLimiter;

  constructor(config: HttpConnectorConfig) {
    this.http = new AuthenticatedHttpClient(config);
    if (config.rateLimitPerSecond) {
      this.rateLimiter = new RateLimiter(config.rateLimitPerSecond);
    }
    this.registerOperations();
  }

  /** Subclasses override this to register their operations. */
  protected abstract registerOperations(): void;

  /**
   * Dispatch an operation by ID. Waits for a rate-limit token if a
   * {@link RateLimiter} is configured, then invokes the registered handler.
   *
   * @throws Error if the operation ID is not registered.
   */
  async execute(
    operationId: string,
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const handler = this.operations.get(operationId);
    if (!handler) {
      const available = Array.from(this.operations.keys()).join(', ');
      throw new Error(
        `Unknown operation "${operationId}". Available: ${available}`,
      );
    }
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }
    return handler(inputs);
  }

  /** Register an operation handler. */
  protected registerOperation(id: string, handler: OperationHandler): void {
    this.operations.set(id, handler);
  }
}
