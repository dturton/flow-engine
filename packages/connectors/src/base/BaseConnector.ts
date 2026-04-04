import type { Connector } from '@flow-engine/core';
import type { OperationHandler, HttpConnectorConfig } from './types.js';
import { AuthenticatedHttpClient } from './AuthenticatedHttpClient.js';
import { RateLimiter } from './RateLimiter.js';

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
