/** Describes the shape of an operation's output for autosuggest. */
export interface OutputField {
  key: string;
  hint: string;
  /** Nested children (e.g. items inside an array element) */
  children?: OutputField[];
}

export interface OperationInfo {
  id: string;
  label: string;
  /** Describes the output shape so the path autosuggest can show deeper paths. */
  outputFields?: OutputField[];
}

export interface ConnectorInfo {
  key: string;
  label: string;
  description: string;
  /** Whether this connector requires a connectionId (stored credentials) */
  requiresConnection: boolean;
  operations: OperationInfo[];
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
      {
        id: 'products.list',
        label: 'List Products',
        outputFields: [
          {
            key: 'data',
            hint: 'array of products',
            children: [
              { key: 'id', hint: 'product GID' },
              { key: 'title', hint: 'product title' },
              { key: 'handle', hint: 'URL handle' },
              { key: 'status', hint: 'ACTIVE/DRAFT/ARCHIVED' },
              { key: 'vendor', hint: 'vendor name' },
              { key: 'tags', hint: 'array of tags' },
              { key: 'variants', hint: 'variant edges' },
              { key: 'images', hint: 'image edges' },
            ],
          },
          { key: 'pageInfo', hint: 'pagination cursor' },
        ],
      },
      {
        id: 'products.get',
        label: 'Get Product',
        outputFields: [
          {
            key: 'data',
            hint: 'product object',
            children: [
              { key: 'id', hint: 'product GID' },
              { key: 'title', hint: 'product title' },
              { key: 'handle', hint: 'URL handle' },
              { key: 'status', hint: 'ACTIVE/DRAFT/ARCHIVED' },
              { key: 'vendor', hint: 'vendor name' },
              { key: 'variants', hint: 'variant edges' },
            ],
          },
        ],
      },
      { id: 'products.create', label: 'Create Product', outputFields: [{ key: 'data', hint: 'created product' }] },
      { id: 'products.update', label: 'Update Product', outputFields: [{ key: 'data', hint: 'updated product' }] },
      { id: 'products.delete', label: 'Delete Product', outputFields: [{ key: 'deleted', hint: 'boolean' }, { key: 'id', hint: 'deleted product GID' }] },
      {
        id: 'orders.list',
        label: 'List Orders',
        outputFields: [
          {
            key: 'data',
            hint: 'array of orders',
            children: [
              { key: 'id', hint: 'order GID' },
              { key: 'name', hint: 'order number' },
              { key: 'totalPriceSet', hint: 'total price' },
              { key: 'displayFulfillmentStatus', hint: 'fulfillment status' },
              { key: 'displayFinancialStatus', hint: 'financial status' },
            ],
          },
          { key: 'pageInfo', hint: 'pagination cursor' },
        ],
      },
      { id: 'orders.get', label: 'Get Order', outputFields: [{ key: 'data', hint: 'order object' }] },
      { id: 'orders.create', label: 'Create Order', outputFields: [{ key: 'data', hint: 'created order' }] },
      { id: 'orders.update', label: 'Update Order', outputFields: [{ key: 'data', hint: 'updated order' }] },
      {
        id: 'customers.list',
        label: 'List Customers',
        outputFields: [
          {
            key: 'data',
            hint: 'array of customers',
            children: [
              { key: 'id', hint: 'customer GID' },
              { key: 'firstName', hint: 'first name' },
              { key: 'lastName', hint: 'last name' },
              { key: 'email', hint: 'email address' },
            ],
          },
          { key: 'pageInfo', hint: 'pagination cursor' },
        ],
      },
      { id: 'customers.get', label: 'Get Customer', outputFields: [{ key: 'data', hint: 'customer object' }] },
      { id: 'customers.create', label: 'Create Customer', outputFields: [{ key: 'data', hint: 'created customer' }] },
      { id: 'customers.update', label: 'Update Customer', outputFields: [{ key: 'data', hint: 'updated customer' }] },
      {
        id: 'inventory.list',
        label: 'List Inventory',
        outputFields: [
          { key: 'data', hint: 'array of inventory levels' },
          { key: 'pageInfo', hint: 'pagination cursor' },
        ],
      },
      { id: 'inventory.adjust', label: 'Adjust Inventory', outputFields: [{ key: 'data', hint: 'adjusted inventory' }] },
    ],
  },
];

export const CONNECTOR_MAP: Record<string, ConnectorInfo> = Object.fromEntries(
  CONNECTORS.map((c) => [c.key, c]),
);
