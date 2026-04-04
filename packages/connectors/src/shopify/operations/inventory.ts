import type { OperationHandler } from '../../base/types.js';
import type { AuthenticatedHttpClient } from '../../base/AuthenticatedHttpClient.js';
import type { ShopifyInventoryLevel } from '../types.js';
import { extractShopifyPageInfo } from './helpers.js';

export function registerInventoryOperations(
  ops: Map<string, OperationHandler>,
  http: AuthenticatedHttpClient,
): void {
  ops.set('inventory.list', async (inputs) => {
    const query: Record<string, string> = {};

    // Shopify requires location_ids for inventory levels
    const locationIds = inputs.locationIds as string | string[];
    if (Array.isArray(locationIds)) {
      query.location_ids = locationIds.join(',');
    } else if (locationIds) {
      query.location_ids = locationIds;
    }

    if (inputs.limit != null) {
      query.limit = String(inputs.limit);
    }

    const result = await http.get<{ inventory_levels: ShopifyInventoryLevel[] }>(
      '/inventory_levels.json',
      query,
    );
    return {
      data: result.data.inventory_levels,
      pageInfo: extractShopifyPageInfo(result.headers),
    };
  });

  ops.set('inventory.adjust', async (inputs) => {
    const result = await http.post<{ inventory_level: ShopifyInventoryLevel }>(
      '/inventory_levels/adjust.json',
      {
        location_id: inputs.locationId,
        inventory_item_id: inputs.inventoryItemId,
        available_adjustment: inputs.availableDelta,
      },
    );
    return { data: result.data.inventory_level };
  });
}
