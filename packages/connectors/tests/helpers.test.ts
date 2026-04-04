import { describe, it, expect } from 'vitest';
import {
  toGid,
  fromGid,
  flattenEdges,
  toPageInfo,
  buildPaginationVariables,
  buildSearchQuery,
  throwOnUserErrors,
} from '../src/shopify/operations/helpers.js';

describe('toGid', () => {
  it('converts a numeric ID to a Shopify GID', () => {
    expect(toGid('Product', 123)).toBe('gid://shopify/Product/123');
  });

  it('converts a string ID to a Shopify GID', () => {
    expect(toGid('Order', '456')).toBe('gid://shopify/Order/456');
  });

  it('returns an existing GID unchanged', () => {
    const gid = 'gid://shopify/Product/789';
    expect(toGid('Product', gid)).toBe(gid);
  });
});

describe('fromGid', () => {
  it('extracts the numeric ID from a GID', () => {
    expect(fromGid('gid://shopify/Product/123')).toBe('123');
  });

  it('handles GIDs with extra path segments', () => {
    expect(fromGid('gid://shopify/InventoryItem/456')).toBe('456');
  });
});

describe('flattenEdges', () => {
  it('returns an empty array for empty edges', () => {
    expect(flattenEdges({ edges: [] })).toEqual([]);
  });

  it('extracts nodes from edges', () => {
    const connection = {
      edges: [
        { node: { id: '1', title: 'A' } },
        { node: { id: '2', title: 'B' } },
      ],
    };
    expect(flattenEdges(connection)).toEqual([
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
    ]);
  });
});

describe('toPageInfo', () => {
  it('returns null when hasNextPage is false', () => {
    expect(toPageInfo({ hasNextPage: false, endCursor: 'abc' })).toBeNull();
  });

  it('returns PageInfo with cursor when hasNextPage is true', () => {
    expect(toPageInfo({ hasNextPage: true, endCursor: 'cursor123' })).toEqual({
      cursor: 'cursor123',
      hasNextPage: true,
    });
  });

  it('handles null endCursor', () => {
    expect(toPageInfo({ hasNextPage: true, endCursor: null })).toEqual({
      cursor: undefined,
      hasNextPage: true,
    });
  });
});

describe('buildPaginationVariables', () => {
  it('defaults first to 50 when no limit provided', () => {
    expect(buildPaginationVariables({})).toEqual({ first: 50 });
  });

  it('maps limit to first', () => {
    expect(buildPaginationVariables({ limit: 25 })).toEqual({ first: 25 });
  });

  it('includes after when pageInfo.cursor is present', () => {
    expect(
      buildPaginationVariables({
        limit: 10,
        pageInfo: { cursor: 'abc123', hasNextPage: true },
      }),
    ).toEqual({ first: 10, after: 'abc123' });
  });

  it('omits after when pageInfo has no cursor', () => {
    expect(
      buildPaginationVariables({ pageInfo: { hasNextPage: false } }),
    ).toEqual({ first: 50 });
  });
});

describe('buildSearchQuery', () => {
  it('returns undefined when no filters provided', () => {
    expect(buildSearchQuery({})).toBeUndefined();
  });

  it('builds a status filter', () => {
    expect(buildSearchQuery({ status: 'active' })).toBe('status:active');
  });

  it('passes through a raw query string', () => {
    expect(buildSearchQuery({ query: 'tag:sale' })).toBe('tag:sale');
  });

  it('combines status and query', () => {
    expect(buildSearchQuery({ status: 'active', query: 'tag:sale' })).toBe(
      'status:active tag:sale',
    );
  });

  it('ignores non-string status', () => {
    expect(buildSearchQuery({ status: 123 })).toBeUndefined();
  });
});

describe('throwOnUserErrors', () => {
  it('does not throw when userErrors is empty', () => {
    expect(() => throwOnUserErrors([], 'test')).not.toThrow();
  });

  it('does not throw when userErrors is null or undefined', () => {
    expect(() => throwOnUserErrors(null, 'test')).not.toThrow();
    expect(() => throwOnUserErrors(undefined, 'test')).not.toThrow();
  });

  it('throws with field path when userErrors are present', () => {
    const errors = [{ field: ['product', 'title'], message: 'is required' }];
    expect(() => throwOnUserErrors(errors, 'productCreate')).toThrow(
      'Shopify productCreate failed: product.title: is required',
    );
  });

  it('throws without field path when field is not set', () => {
    const errors = [{ message: 'Something went wrong' }];
    expect(() => throwOnUserErrors(errors, 'orderUpdate')).toThrow(
      'Shopify orderUpdate failed: Something went wrong',
    );
  });

  it('joins multiple errors with semicolons', () => {
    const errors = [
      { field: ['title'], message: 'is blank' },
      { field: ['vendor'], message: 'is too long' },
    ];
    expect(() => throwOnUserErrors(errors, 'productCreate')).toThrow(
      'Shopify productCreate failed: title: is blank; vendor: is too long',
    );
  });
});
