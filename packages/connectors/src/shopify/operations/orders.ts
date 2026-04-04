import type { OperationHandler } from '../../base/types.js';
import type { ShopifyGraphQLClient } from '../graphql-client.js';
import type { ShopifyOrder, ShopifyConnection } from '../types.js';
import {
  toGid,
  flattenEdges,
  toPageInfo,
  buildPaginationVariables,
  buildSearchQuery,
  throwOnUserErrors,
} from './helpers.js';
import type { UserError } from '../graphql-client.js';

const ORDER_FRAGMENT = `
  fragment OrderFields on Order {
    id
    name
    email
    displayFinancialStatus
    displayFulfillmentStatus
    totalPriceSet { shopMoney { amount currencyCode } }
    lineItems(first: 100) {
      edges {
        node {
          id
          title
          quantity
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          sku
          product { id }
          variant { id }
        }
      }
    }
    customer {
      id
      email
      firstName
      lastName
    }
    createdAt
    updatedAt
  }
`;

const ORDERS_QUERY = `
  ${ORDER_FRAGMENT}
  query orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query) {
      edges { node { ...OrderFields } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_QUERY = `
  ${ORDER_FRAGMENT}
  query order($id: ID!) {
    order(id: $id) { ...OrderFields }
  }
`;

const DRAFT_ORDER_CREATE = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        order { id }
        createdAt
        updatedAt
      }
      userErrors { field message }
    }
  }
`;

const ORDER_UPDATE = `
  ${ORDER_FRAGMENT}
  mutation orderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { ...OrderFields }
      userErrors { field message }
    }
  }
`;

export function registerOrderOperations(
  ops: Map<string, OperationHandler>,
  graphql: ShopifyGraphQLClient,
): void {
  ops.set('orders.list', async (inputs) => {
    const pagination = buildPaginationVariables(inputs);
    const query = buildSearchQuery(inputs);
    const data = await graphql.query<{
      orders: ShopifyConnection<ShopifyOrder>;
    }>(ORDERS_QUERY, { ...pagination, query });
    return {
      data: flattenEdges(data.orders),
      pageInfo: toPageInfo(data.orders.pageInfo),
    };
  });

  ops.set('orders.get', async (inputs) => {
    const id = toGid('Order', inputs.id as string | number);
    const data = await graphql.query<{ order: ShopifyOrder }>(ORDER_QUERY, { id });
    return { data: data.order };
  });

  ops.set('orders.create', async (inputs) => {
    const order = (inputs.order ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      draftOrderCreate: {
        draftOrder: { id: string; name: string; order: { id: string } | null; createdAt: string; updatedAt: string };
        userErrors: UserError[];
      };
    }>(DRAFT_ORDER_CREATE, { input: order });
    throwOnUserErrors(data.draftOrderCreate.userErrors, 'draftOrderCreate');
    return { data: data.draftOrderCreate.draftOrder };
  });

  ops.set('orders.update', async (inputs) => {
    const id = toGid('Order', inputs.id as string | number);
    const order = (inputs.order ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      orderUpdate: { order: ShopifyOrder; userErrors: UserError[] };
    }>(ORDER_UPDATE, { input: { ...order, id } });
    throwOnUserErrors(data.orderUpdate.userErrors, 'orderUpdate');
    return { data: data.orderUpdate.order };
  });
}
