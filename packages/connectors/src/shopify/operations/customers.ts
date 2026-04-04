import type { OperationHandler } from '../../base/types.js';
import type { ShopifyGraphQLClient } from '../graphql-client.js';
import type { ShopifyCustomer, ShopifyConnection } from '../types.js';
import {
  toGid,
  flattenEdges,
  toPageInfo,
  buildPaginationVariables,
  buildSearchQuery,
  throwOnUserErrors,
} from './helpers.js';
import type { UserError } from '../graphql-client.js';

const CUSTOMER_FRAGMENT = `
  fragment CustomerFields on Customer {
    id
    email
    firstName
    lastName
    phone
    numberOfOrders
    amountSpent { amount currencyCode }
    tags
    createdAt
    updatedAt
  }
`;

const CUSTOMERS_QUERY = `
  ${CUSTOMER_FRAGMENT}
  query customers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query) {
      edges { node { ...CustomerFields } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CUSTOMER_QUERY = `
  ${CUSTOMER_FRAGMENT}
  query customer($id: ID!) {
    customer(id: $id) { ...CustomerFields }
  }
`;

const CUSTOMER_CREATE = `
  ${CUSTOMER_FRAGMENT}
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { ...CustomerFields }
      userErrors { field message }
    }
  }
`;

const CUSTOMER_UPDATE = `
  ${CUSTOMER_FRAGMENT}
  mutation customerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { ...CustomerFields }
      userErrors { field message }
    }
  }
`;

export function registerCustomerOperations(
  ops: Map<string, OperationHandler>,
  graphql: ShopifyGraphQLClient,
): void {
  ops.set('customers.list', async (inputs) => {
    const pagination = buildPaginationVariables(inputs);
    const query = buildSearchQuery(inputs);
    const data = await graphql.query<{
      customers: ShopifyConnection<ShopifyCustomer>;
    }>(CUSTOMERS_QUERY, { ...pagination, query });
    return {
      data: flattenEdges(data.customers),
      pageInfo: toPageInfo(data.customers.pageInfo),
    };
  });

  ops.set('customers.get', async (inputs) => {
    const id = toGid('Customer', inputs.id as string | number);
    const data = await graphql.query<{ customer: ShopifyCustomer }>(CUSTOMER_QUERY, { id });
    return { data: data.customer };
  });

  ops.set('customers.create', async (inputs) => {
    const customer = (inputs.customer ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      customerCreate: { customer: ShopifyCustomer; userErrors: UserError[] };
    }>(CUSTOMER_CREATE, { input: customer });
    throwOnUserErrors(data.customerCreate.userErrors, 'customerCreate');
    return { data: data.customerCreate.customer };
  });

  ops.set('customers.update', async (inputs) => {
    const id = toGid('Customer', inputs.id as string | number);
    const customer = (inputs.customer ?? inputs) as Record<string, unknown>;
    const data = await graphql.query<{
      customerUpdate: { customer: ShopifyCustomer; userErrors: UserError[] };
    }>(CUSTOMER_UPDATE, { input: { ...customer, id } });
    throwOnUserErrors(data.customerUpdate.userErrors, 'customerUpdate');
    return { data: data.customerUpdate.customer };
  });
}
