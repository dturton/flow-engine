import type { StepExecutor, StepExecutionInput, StepExecutionResult } from '../engine/StepExecutor.js';
import type { StepType } from '../types/flow.js';
import { ConnectorNotFoundError } from '../errors.js';

export interface Connector {
  execute(operationId: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  register(key: string, connector: Connector): void {
    this.connectors.set(key, connector);
  }

  get(key: string): Connector | undefined {
    return this.connectors.get(key);
  }
}

export class ActionExecutor implements StepExecutor {
  readonly type: StepType = 'action';

  constructor(private connectorRegistry: ConnectorRegistry) {}

  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    const { step, resolvedInputs } = input;
    const startTime = Date.now();

    if (!step.connectorKey) {
      throw new ConnectorNotFoundError(`Step "${step.id}" has no connectorKey`);
    }

    const connector = this.connectorRegistry.get(step.connectorKey);
    if (!connector) {
      throw new ConnectorNotFoundError(`Connector not found: "${step.connectorKey}"`);
    }

    const output = await connector.execute(step.operationId ?? 'default', resolvedInputs);
    const durationMs = Date.now() - startTime;

    return {
      output,
      logs: [
        {
          level: 'info',
          message: `Action "${step.connectorKey}.${step.operationId}" executed successfully`,
          timestamp: new Date(),
          meta: { connectorKey: step.connectorKey, operationId: step.operationId },
        },
      ],
      durationMs,
    };
  }
}
