/**
 * Shopify connector using the GraphQL Admin API. Registers operations for
 * products, orders, customers, and inventory. Supports two auth modes:
 * - Manual: provide a static accessToken
 * - OAuth: provide clientId + clientSecret, tokens are auto-obtained and refreshed
 */

import { BaseConnector } from '../base/BaseConnector.js';
import { ShopifyGraphQLClient } from './graphql-client.js';
import { registerProductOperations } from './operations/products.js';
import { registerOrderOperations } from './operations/orders.js';
import { registerCustomerOperations } from './operations/customers.js';
import { registerInventoryOperations } from './operations/inventory.js';
import { exchangeForToken } from './ShopifyAuthClient.js';

/** Configuration for creating a {@link ShopifyConnector} instance. */
export interface ShopifyConfig {
  /** e.g. "my-store.myshopify.com" */
  storeUrl: string;
  /** Static access token (manual mode). If provided, OAuth fields are ignored. */
  accessToken?: string;
  /** OAuth client ID (OAuth mode). Used with clientSecret to auto-obtain tokens. */
  clientId?: string;
  /** OAuth client secret (OAuth mode). */
  clientSecret?: string;
  /** Shopify API version, defaults to "2025-01" */
  apiVersion?: string;
  /** Requests per second, defaults to 2 (Shopify standard limit) */
  rateLimitPerSecond?: number;
}

/** Buffer before actual expiry to trigger a refresh (5 minutes). */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Connector for the Shopify GraphQL Admin API. Normalizes the store URL,
 * sets up auth, and delegates to operation modules for each resource type.
 * Supports automatic token refresh via client credentials grant.
 */
export class ShopifyConnector extends BaseConnector {
  private readonly storeDomain: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private tokenExpiresAt = 0;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: ShopifyConfig) {
    const apiVersion = config.apiVersion ?? '2025-01';
    const store = config.storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (!config.accessToken && (!config.clientId || !config.clientSecret)) {
      throw new Error(
        'ShopifyConnector requires either accessToken or both clientId and clientSecret',
      );
    }

    super({
      baseUrl: `https://${store}/admin/api/${apiVersion}`,
      auth: config.accessToken
        ? { type: 'header', headerName: 'X-Shopify-Access-Token', value: config.accessToken }
        : { type: 'none' },
      rateLimitPerSecond: config.rateLimitPerSecond ?? 2,
    });

    this.storeDomain = store;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;

    // If a static token was provided, mark it as non-expiring
    if (config.accessToken) {
      this.tokenExpiresAt = Infinity;
    }
  }

  /** Ensure a valid token is set before executing any operation. */
  async execute(
    operationId: string,
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.ensureValidToken();
    return super.execute(operationId, inputs);
  }

  private async ensureValidToken(): Promise<void> {
    if (Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) return;
    if (!this.clientId || !this.clientSecret) return;

    // Coalesce concurrent refresh requests
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshToken();
    }
    await this.refreshPromise;
    this.refreshPromise = null;
  }

  private async refreshToken(): Promise<void> {
    const result = await exchangeForToken(this.storeDomain, this.clientId!, this.clientSecret!);
    this.http.updateAuth({
      type: 'header',
      headerName: 'X-Shopify-Access-Token',
      value: result.accessToken,
    });
    this.tokenExpiresAt = Date.now() + result.expiresIn * 1000;
  }

  protected registerOperations(): void {
    const graphql = new ShopifyGraphQLClient(this.http);
    registerProductOperations(this.operations, graphql);
    registerOrderOperations(this.operations, graphql);
    registerCustomerOperations(this.operations, graphql);
    registerInventoryOperations(this.operations, graphql);
  }
}
