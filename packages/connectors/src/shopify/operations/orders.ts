import type { OperationHandler } from '../../base/types.js';
import type { AuthenticatedHttpClient } from '../../base/AuthenticatedHttpClient.js';
import type { ShopifyOrder } from '../types.js';
import { buildListQuery, extractShopifyPageInfo } from './helpers.js';

export function registerOrderOperations(
  ops: Map<string, OperationHandler>,
  http: AuthenticatedHttpClient,
): void {
  ops.set('orders.list', async (inputs) => {
    const query = buildListQuery(inputs);
    const result = await http.get<{ orders: ShopifyOrder[] }>('/orders.json', query);
    return {
      data: result.data.orders,
      pageInfo: extractShopifyPageInfo(result.headers),
    };
  });

  ops.set('orders.get', async (inputs) => {
    const id = inputs.id as string | number;
    const result = await http.get<{ order: ShopifyOrder }>(`/orders/${id}.json`);
    return { data: result.data.order };
  });

  ops.set('orders.create', async (inputs) => {
    const order = (inputs.order ?? inputs) as Record<string, unknown>;
    const result = await http.post<{ order: ShopifyOrder }>('/orders.json', { order });
    return { data: result.data.order };
  });

  ops.set('orders.update', async (inputs) => {
    const id = inputs.id as string | number;
    const order = (inputs.order ?? inputs) as Record<string, unknown>;
    const result = await http.put<{ order: ShopifyOrder }>(`/orders/${id}.json`, { order });
    return { data: result.data.order };
  });
}
