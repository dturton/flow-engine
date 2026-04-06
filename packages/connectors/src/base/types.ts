/**
 * Shared type definitions for connector configuration, authentication,
 * operation handlers, and pagination.
 */

import type { Connector } from '@flow-engine/core';

/** A single operation handler within a connector. */
export type OperationHandler = (
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** Auth configuration for HTTP-based connectors. */
export type AuthConfig =
  | { type: 'header'; headerName: string; value: string }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'none' };

/** Config for connectors that talk to an HTTP API. */
export interface HttpConnectorConfig {
  baseUrl: string;
  auth: AuthConfig;
  rateLimitPerSecond?: number;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
}

/** Cursor/page info returned from paginated list operations. */
export interface PageInfo {
  cursor?: string;
  nextPage?: number;
  hasNextPage: boolean;
}

/** Standard shape for paginated list responses. */
export interface PaginatedResponse<T = unknown> {
  data: T[];
  pageInfo: PageInfo | null;
}

/** Input shape that list operations accept for pagination. */
export interface PaginationInput {
  limit?: number;
  pageInfo?: PageInfo;
}

export type { Connector };
