/**
 * Lightweight GraphQL client for the Shopify Admin API. Sends all queries
 * as POST to `/graphql.json`, extracts the data payload, and throws on
 * GraphQL-level errors.
 */

import type { AuthenticatedHttpClient } from '../base/AuthenticatedHttpClient.js';

/** A single GraphQL error from the Shopify response. */
export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

/** Full GraphQL response envelope including optional errors and extensions. */
export interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

/** Shopify mutation user error — returned when input validation fails. */
export interface UserError {
  field?: string[];
  message: string;
}

/**
 * Thin wrapper around AuthenticatedHttpClient for Shopify GraphQL Admin API.
 * Sends all requests as POST to /graphql.json and handles error extraction.
 */
export class ShopifyGraphQLClient {
  constructor(private readonly http: AuthenticatedHttpClient) {}

  /**
   * Execute a GraphQL query or mutation against the Shopify Admin API.
   * @throws Error if the response contains GraphQL errors or missing data.
   */
  async query<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const result = await this.http.post<GraphQLResponse<T>>('/graphql.json', {
      query,
      variables,
    });

    if (result.data.errors?.length) {
      const messages = result.data.errors.map((e) => e.message).join('; ');
      throw new Error(`Shopify GraphQL error: ${messages}`);
    }

    if (!result.data.data) {
      throw new Error('Shopify GraphQL response missing data');
    }

    return result.data.data;
  }
}
