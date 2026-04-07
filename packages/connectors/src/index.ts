/**
 * @module @flow-engine/connectors
 *
 * Public API for the connector library. Re-exports base classes, utilities,
 * and concrete connector implementations (HttpConnector, ShopifyConnector).
 */

// Base utilities
export { BaseConnector } from './base/BaseConnector.js';
export { AuthenticatedHttpClient } from './base/AuthenticatedHttpClient.js';
export type { HttpResponse } from './base/AuthenticatedHttpClient.js';
export { RateLimiter } from './base/RateLimiter.js';
export { classifyHttpError, ConnectorApiError } from './base/error-classifier.js';
export { ConnectorFactory } from './base/ConnectorFactory.js';
export type { ConnectorBuilder } from './base/ConnectorFactory.js';
export type {
  OperationHandler,
  HttpConnectorConfig,
  AuthConfig,
  PaginatedResponse,
  PageInfo,
  PaginationInput,
} from './base/types.js';

// SSRF protection
export { validateUrl } from './utils/url-validator.js';

// Connectors
export { HttpConnector } from './http/HttpConnector.js';
export { ShopifyConnector } from './shopify/ShopifyConnector.js';
export type { ShopifyConfig } from './shopify/ShopifyConnector.js';
