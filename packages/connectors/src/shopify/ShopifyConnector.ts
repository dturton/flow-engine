import { BaseConnector } from '../base/BaseConnector.js';
import { ShopifyGraphQLClient } from './graphql-client.js';
import { registerProductOperations } from './operations/products.js';
import { registerOrderOperations } from './operations/orders.js';
import { registerCustomerOperations } from './operations/customers.js';
import { registerInventoryOperations } from './operations/inventory.js';

export interface ShopifyConfig {
  /** e.g. "my-store.myshopify.com" */
  storeUrl: string;
  accessToken: string;
  /** Shopify API version, defaults to "2025-01" */
  apiVersion?: string;
  /** Requests per second, defaults to 2 (Shopify standard limit) */
  rateLimitPerSecond?: number;
}

export class ShopifyConnector extends BaseConnector {
  constructor(config: ShopifyConfig) {
    const apiVersion = config.apiVersion ?? '2025-01';
    const store = config.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    super({
      baseUrl: `https://${store}/admin/api/${apiVersion}`,
      auth: {
        type: 'header',
        headerName: 'X-Shopify-Access-Token',
        value: config.accessToken,
      },
      rateLimitPerSecond: config.rateLimitPerSecond ?? 2,
    });
  }

  protected registerOperations(): void {
    const graphql = new ShopifyGraphQLClient(this.http);
    registerProductOperations(this.operations, graphql);
    registerOrderOperations(this.operations, graphql);
    registerCustomerOperations(this.operations, graphql);
    registerInventoryOperations(this.operations, graphql);
  }
}
