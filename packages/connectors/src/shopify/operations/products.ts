/**
 * Shopify product operations: list, get, create, update, delete.
 * Uses GraphQL Admin API with cursor-based pagination for list queries.
 */

import type { OperationHandler } from '../../base/types.js';
import type { ShopifyGraphQLClient } from '../graphql-client.js';
import type { ShopifyProduct, ShopifyConnection } from '../types.js';
import {
  toGid,
  flattenEdges,
  toPageInfo,
  buildPaginationVariables,
  buildSearchQuery,
  throwOnUserErrors,
} from './helpers.js';
import type { UserError } from '../graphql-client.js';

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    title
    descriptionHtml
    vendor
    productType
    handle
    status
    tags
    variants(first: 100) {
      edges {
        node {
          id
          title
          price
          sku
          inventoryQuantity
        }
      }
    }
    images(first: 100) {
      edges {
        node {
          id
          url
          altText
        }
      }
    }
    createdAt
    updatedAt
    publishedAt
  }
`;

const PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges { node { ...ProductFields } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_QUERY = `
  ${PRODUCT_FRAGMENT}
  query product($id: ID!) {
    product(id: $id) { ...ProductFields }
  }
`;

const PRODUCT_CREATE = `
  ${PRODUCT_FRAGMENT}
  mutation productCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { ...ProductFields }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE = `
  ${PRODUCT_FRAGMENT}
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { ...ProductFields }
      userErrors { field message }
    }
  }
`;

const PRODUCT_DELETE = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

/** Register products.list, products.get, products.create, products.update, and products.delete operations. */
export function registerProductOperations(
  ops: Map<string, OperationHandler>,
  graphql: ShopifyGraphQLClient,
): void {
  ops.set('products.list', async (inputs) => {
    const pagination = buildPaginationVariables(inputs);
    const query = buildSearchQuery(inputs);
    const data = await graphql.query<{
      products: ShopifyConnection<ShopifyProduct>;
    }>(PRODUCTS_QUERY, { ...pagination, query });
    return {
      data: flattenEdges(data.products),
      pageInfo: toPageInfo(data.products.pageInfo),
    };
  });

  ops.set('products.get', async (inputs) => {
    const id = toGid('Product', inputs.id as string | number);
    const data = await graphql.query<{ product: ShopifyProduct }>(PRODUCT_QUERY, { id });
    return { data: data.product };
  });

  ops.set('products.create', async (inputs) => {
    const product = (inputs.product ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      productCreate: { product: ShopifyProduct; userErrors: UserError[] };
    }>(PRODUCT_CREATE, { product });
    throwOnUserErrors(data.productCreate.userErrors, 'productCreate');
    return { data: data.productCreate.product };
  });

  ops.set('products.update', async (inputs) => {
    const id = toGid('Product', inputs.id as string | number);
    const product = (inputs.product ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      productUpdate: { product: ShopifyProduct; userErrors: UserError[] };
    }>(PRODUCT_UPDATE, { product: { ...product, id } });
    throwOnUserErrors(data.productUpdate.userErrors, 'productUpdate');
    return { data: data.productUpdate.product };
  });

  ops.set('products.delete', async (inputs) => {
    const id = toGid('Product', inputs.id as string | number);
    const data = await graphql.query<{
      productDelete: { deletedProductId: string; userErrors: UserError[] };
    }>(PRODUCT_DELETE, { input: { id } });
    throwOnUserErrors(data.productDelete.userErrors, 'productDelete');
    return { deleted: true, id: data.productDelete.deletedProductId };
  });
}
