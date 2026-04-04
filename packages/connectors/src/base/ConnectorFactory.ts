import type { Connector } from '@flow-engine/core';
import type { Connection } from '@flow-engine/core';

/**
 * A function that creates a Connector instance from a Connection's
 * credentials and config.
 */
export type ConnectorBuilder = (connection: Connection) => Connector;

/**
 * Factory for creating connector instances from stored Connection records.
 * Each connectorKey (e.g., "shopify", "http") maps to a builder function.
 */
export class ConnectorFactory {
  private builders = new Map<string, ConnectorBuilder>();

  /** Register a builder for a connector key. */
  registerBuilder(connectorKey: string, builder: ConnectorBuilder): void {
    this.builders.set(connectorKey, builder);
  }

  /** Create a connector instance from a Connection record. */
  create(connection: Connection): Connector {
    const builder = this.builders.get(connection.connectorKey);
    if (!builder) {
      throw new Error(
        `No builder registered for connector key "${connection.connectorKey}". ` +
        `Available: ${Array.from(this.builders.keys()).join(', ')}`,
      );
    }
    return builder(connection);
  }

  /** Check if a builder exists for a connector key. */
  has(connectorKey: string): boolean {
    return this.builders.has(connectorKey);
  }
}
