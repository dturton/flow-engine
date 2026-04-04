import { describe, it, expect } from 'vitest';
import {
  buildListQuery,
  extractShopifyPageInfo,
} from '../src/shopify/operations/helpers.js';

describe('buildListQuery', () => {
  it('returns empty object when no inputs are provided', () => {
    expect(buildListQuery({})).toEqual({});
  });

  it('includes limit when provided', () => {
    expect(buildListQuery({ limit: 25 })).toEqual({ limit: '25' });
  });

  it('includes fields, status, and sinceId when no cursor is present', () => {
    const result = buildListQuery({
      limit: 10,
      fields: 'id,title',
      status: 'active',
      sinceId: '123',
    });
    expect(result).toEqual({
      limit: '10',
      fields: 'id,title',
      status: 'active',
      since_id: '123',
    });
  });

  it('includes page_info when cursor is present and strips non-limit params', () => {
    // Shopify requires that when page_info is present, only limit may accompany it
    const result = buildListQuery({
      limit: 20,
      fields: 'id,title',
      status: 'active',
      sinceId: '999',
      pageInfo: { cursor: 'abc123', hasNextPage: true },
    });
    expect(result).toEqual({ limit: '20', page_info: 'abc123' });
    expect(result).not.toHaveProperty('fields');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('since_id');
  });

  it('returns only page_info (no limit) when cursor is set and limit is absent', () => {
    const result = buildListQuery({ pageInfo: { cursor: 'xyz', hasNextPage: true } });
    expect(result).toEqual({ page_info: 'xyz' });
  });

  it('does not include page_info when pageInfo has no cursor', () => {
    const result = buildListQuery({ pageInfo: { hasNextPage: false } });
    expect(result).not.toHaveProperty('page_info');
  });

  it('ignores non-string fields/status/sinceId', () => {
    const result = buildListQuery({ fields: 123, status: true, sinceId: null });
    expect(result).toEqual({});
  });
});

describe('extractShopifyPageInfo', () => {
  it('returns null when there is no Link header', () => {
    expect(extractShopifyPageInfo({})).toBeNull();
  });

  it('returns null when the Link header has no "next" rel', () => {
    const headers = {
      link: '<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=prev>; rel="previous"',
    };
    expect(extractShopifyPageInfo(headers)).toBeNull();
  });

  it('extracts the cursor from a next Link header', () => {
    const headers = {
      link: '<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=eyJsYXN0X2lkIjo0fQ>; rel="next"',
    };
    const result = extractShopifyPageInfo(headers);
    expect(result).toEqual({ cursor: 'eyJsYXN0X2lkIjo0fQ', hasNextPage: true });
  });

  it('URL-decodes the cursor', () => {
    // Shopify sometimes percent-encodes the cursor value
    const encoded = 'eyJsYXN0X2lkIjoxMDAsImxhc3RfdmFsdWUiOiIxMDAlMkIifQ%3D%3D';
    const decoded = decodeURIComponent(encoded);
    const headers = {
      link: `<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=${encoded}>; rel="next"`,
    };
    const result = extractShopifyPageInfo(headers);
    expect(result?.cursor).toBe(decoded);
  });

  it('handles a Link header that contains both previous and next rels', () => {
    const headers = {
      link: [
        '<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=prev>; rel="previous"',
        '<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=nextCursor>; rel="next"',
      ].join(', '),
    };
    const result = extractShopifyPageInfo(headers);
    expect(result).toEqual({ cursor: 'nextCursor', hasNextPage: true });
  });

  it('accepts Link header spelled with capital L', () => {
    const headers = {
      Link: '<https://store.myshopify.com/admin/api/2024-10/products.json?page_info=capital>; rel="next"',
    };
    const result = extractShopifyPageInfo(headers);
    expect(result?.cursor).toBe('capital');
  });
});
