import type { PageInfo } from '../../base/types.js';
import type { UserError } from '../graphql-client.js';

/** Convert a numeric or string ID to a Shopify Global ID. */
export function toGid(resource: string, id: string | number): string {
  const idStr = String(id);
  if (idStr.startsWith('gid://')) return idStr;
  return `gid://shopify/${resource}/${idStr}`;
}

/** Extract the numeric ID from a Shopify Global ID. */
export function fromGid(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/** Flatten a GraphQL connection (edges/nodes) into a plain array. */
export function flattenEdges<T>(connection: {
  edges: { node: T }[];
}): T[] {
  return connection.edges.map((edge) => edge.node);
}

/**
 * Convert GraphQL pageInfo to our standard PageInfo shape.
 *
 * Shopify GraphQL returns:
 *   { hasNextPage: boolean, endCursor: string | null }
 *
 * We map endCursor → cursor for our PageInfo type.
 */
export function toPageInfo(graphqlPageInfo: {
  hasNextPage: boolean;
  endCursor?: string | null;
}): PageInfo | null {
  if (!graphqlPageInfo.hasNextPage) return null;
  return {
    cursor: graphqlPageInfo.endCursor ?? undefined,
    hasNextPage: true,
  };
}

/**
 * Build GraphQL pagination variables from operation inputs.
 *
 * Accepts `limit` (mapped to `first`) and `pageInfo.cursor` (mapped to `after`).
 * Defaults `first` to 50 if not specified.
 */
export function buildPaginationVariables(inputs: Record<string, unknown>): {
  first: number;
  after?: string;
} {
  const first = inputs.limit != null ? Number(inputs.limit) : 50;
  const pageInfo = inputs.pageInfo as { cursor?: string } | undefined;
  const after = pageInfo?.cursor;
  return after ? { first, after } : { first };
}

/**
 * Build a Shopify search query string from filter inputs.
 *
 * Shopify GraphQL list queries accept a `query` parameter using their
 * search syntax (e.g. "status:active tag:sale").
 */
export function buildSearchQuery(inputs: Record<string, unknown>): string | undefined {
  const parts: string[] = [];

  if (typeof inputs.status === 'string') {
    parts.push(`status:${inputs.status}`);
  }
  if (typeof inputs.query === 'string') {
    parts.push(inputs.query);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Check for userErrors in a Shopify GraphQL mutation response and throw if present.
 */
export function throwOnUserErrors(
  userErrors: UserError[] | undefined | null,
  operation: string,
): void {
  if (!userErrors?.length) return;
  const messages = userErrors.map((e) => {
    const field = e.field?.join('.') ?? '';
    return field ? `${field}: ${e.message}` : e.message;
  });
  throw new Error(`Shopify ${operation} failed: ${messages.join('; ')}`);
}
