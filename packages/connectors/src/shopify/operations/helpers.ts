import type { PageInfo } from '../../base/types.js';

/**
 * Build query params for a Shopify list endpoint from operation inputs.
 */
export function buildListQuery(inputs: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};

  if (inputs.limit != null) {
    query.limit = String(inputs.limit);
  }

  // Cursor-based pagination: pass page_info from previous response
  const pageInfo = inputs.pageInfo as PageInfo | undefined;
  if (pageInfo?.cursor) {
    query.page_info = pageInfo.cursor;
  }

  if (typeof inputs.fields === 'string') {
    query.fields = inputs.fields;
  }

  if (typeof inputs.status === 'string') {
    query.status = inputs.status;
  }

  if (typeof inputs.sinceId === 'string') {
    query.since_id = inputs.sinceId;
  }

  return query;
}

/**
 * Parse Shopify's Link header to extract cursor-based page info.
 *
 * Shopify returns pagination cursors in the Link header:
 *   <https://store.myshopify.com/admin/api/2024-10/products.json?page_info=xyz>; rel="next"
 */
export function extractShopifyPageInfo(headers: Record<string, string>): PageInfo | null {
  const link = headers['link'] ?? headers['Link'];
  if (!link) return null;

  const nextMatch = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  if (!nextMatch) return null;

  return {
    cursor: nextMatch[1],
    hasNextPage: true,
  };
}
