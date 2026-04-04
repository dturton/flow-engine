import type { AuthenticatedHttpClient } from '../base/AuthenticatedHttpClient.js';

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

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
