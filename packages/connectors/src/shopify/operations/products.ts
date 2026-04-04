import type { OperationHandler } from '../../base/types.js';
import type { AuthenticatedHttpClient } from '../../base/AuthenticatedHttpClient.js';
import type { ShopifyProduct } from '../types.js';
import { buildListQuery, extractShopifyPageInfo } from './helpers.js';

export function registerProductOperations(
  ops: Map<string, OperationHandler>,
  http: AuthenticatedHttpClient,
): void {
  ops.set('products.list', async (inputs) => {
    const query = buildListQuery(inputs);
    const result = await http.get<{ products: ShopifyProduct[] }>('/products.json', query);
    return {
      data: result.data.products,
      pageInfo: extractShopifyPageInfo(result.headers),
    };
  });

  ops.set('products.get', async (inputs) => {
    const id = inputs.id as string | number;
    const result = await http.get<{ product: ShopifyProduct }>(`/products/${id}.json`);
    return { data: result.data.product };
  });

  ops.set('products.create', async (inputs) => {
    const product = (inputs.product ?? inputs) as Record<string, unknown>;
    const result = await http.post<{ product: ShopifyProduct }>('/products.json', { product });
    return { data: result.data.product };
  });

  ops.set('products.update', async (inputs) => {
    const id = inputs.id as string | number;
    const product = (inputs.product ?? inputs) as Record<string, unknown>;
    const result = await http.put<{ product: ShopifyProduct }>(`/products/${id}.json`, { product });
    return { data: result.data.product };
  });

  ops.set('products.delete', async (inputs) => {
    const id = inputs.id as string | number;
    await http.delete(`/products/${id}.json`);
    return { deleted: true, id: String(id) };
  });
}
