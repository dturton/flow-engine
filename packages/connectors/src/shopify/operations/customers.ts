import type { OperationHandler } from '../../base/types.js';
import type { AuthenticatedHttpClient } from '../../base/AuthenticatedHttpClient.js';
import type { ShopifyCustomer } from '../types.js';
import { buildListQuery, extractShopifyPageInfo } from './helpers.js';

export function registerCustomerOperations(
  ops: Map<string, OperationHandler>,
  http: AuthenticatedHttpClient,
): void {
  ops.set('customers.list', async (inputs) => {
    const query = buildListQuery(inputs);
    const result = await http.get<{ customers: ShopifyCustomer[] }>('/customers.json', query);
    return {
      data: result.data.customers,
      pageInfo: extractShopifyPageInfo(result.headers),
    };
  });

  ops.set('customers.get', async (inputs) => {
    const id = inputs.id as string | number;
    const result = await http.get<{ customer: ShopifyCustomer }>(`/customers/${id}.json`);
    return { data: result.data.customer };
  });

  ops.set('customers.create', async (inputs) => {
    const customer = (inputs.customer ?? inputs) as Record<string, unknown>;
    const result = await http.post<{ customer: ShopifyCustomer }>('/customers.json', { customer });
    return { data: result.data.customer };
  });

  ops.set('customers.update', async (inputs) => {
    const id = inputs.id as string | number;
    const customer = (inputs.customer ?? inputs) as Record<string, unknown>;
    const result = await http.put<{ customer: ShopifyCustomer }>(`/customers/${id}.json`, { customer });
    return { data: result.data.customer };
  });
}
