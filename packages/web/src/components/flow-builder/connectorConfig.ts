export interface ConnectorInfo {
  key: string;
  label: string;
  description: string;
  /** Whether this connector requires a connectionId (stored credentials) */
  requiresConnection: boolean;
  operations: { id: string; label: string }[];
}

export const CONNECTORS: ConnectorInfo[] = [
  {
    key: 'http',
    label: 'HTTP',
    description: 'Generic HTTP requests',
    requiresConnection: false,
    operations: [
      { id: 'request', label: 'HTTP Request' },
    ],
  },
  {
    key: 'shopify',
    label: 'Shopify',
    description: 'Shopify Admin API',
    requiresConnection: true,
    operations: [
      { id: 'products.list', label: 'List Products' },
      { id: 'products.get', label: 'Get Product' },
      { id: 'products.create', label: 'Create Product' },
      { id: 'products.update', label: 'Update Product' },
      { id: 'products.delete', label: 'Delete Product' },
      { id: 'orders.list', label: 'List Orders' },
      { id: 'orders.get', label: 'Get Order' },
      { id: 'orders.create', label: 'Create Order' },
      { id: 'orders.update', label: 'Update Order' },
      { id: 'customers.list', label: 'List Customers' },
      { id: 'customers.get', label: 'Get Customer' },
      { id: 'customers.create', label: 'Create Customer' },
      { id: 'customers.update', label: 'Update Customer' },
      { id: 'inventory.list', label: 'List Inventory' },
      { id: 'inventory.adjust', label: 'Adjust Inventory' },
    ],
  },
];

export const CONNECTOR_MAP: Record<string, ConnectorInfo> = Object.fromEntries(
  CONNECTORS.map((c) => [c.key, c]),
);
