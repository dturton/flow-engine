/**
 * Shopify inventory operations: list levels by location, adjust quantities.
 * Uses GraphQL Admin API. Inventory levels are scoped to a location ID.
 */

import type { OperationHandler } from '../../base/types.js';
import type { ShopifyGraphQLClient } from '../graphql-client.js';
import type { ShopifyInventoryLevel, ShopifyConnection } from '../types.js';
import { toGid, flattenEdges, toPageInfo, throwOnUserErrors } from './helpers.js';
import type { UserError } from '../graphql-client.js';

const INVENTORY_LEVELS_QUERY = `
  query inventoryLevels($locationId: ID!, $first: Int!, $after: String) {
    location(id: $locationId) {
      inventoryLevels(first: $first, after: $after) {
        edges {
          node {
            id
            quantities(names: ["available"]) { name quantity }
            item { id }
            location { id }
            updatedAt
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const INVENTORY_ADJUST = `
  mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      changes {
        name
        delta
        quantityAfterChange
        item { id }
        location { id }
      }
      userErrors { field message }
    }
  }
`;

/** Register inventory.list and inventory.adjust operations. */
export function registerInventoryOperations(
  ops: Map<string, OperationHandler>,
  graphql: ShopifyGraphQLClient,
): void {
  ops.set('inventory.list', async (inputs) => {
    const locationIds = inputs.locationIds as string | string[];
    const locationId = Array.isArray(locationIds) ? locationIds[0] : locationIds;
    const first = inputs.limit != null ? Number(inputs.limit) : 50;
    const pageInfo = inputs.pageInfo as { cursor?: string } | undefined;

    const data = await graphql.query<{
      location: {
        inventoryLevels: ShopifyConnection<ShopifyInventoryLevel>;
      };
    }>(INVENTORY_LEVELS_QUERY, {
      locationId: toGid('Location', locationId),
      first,
      after: pageInfo?.cursor,
    });

    return {
      data: flattenEdges(data.location.inventoryLevels),
      pageInfo: toPageInfo(data.location.inventoryLevels.pageInfo),
    };
  });

  ops.set('inventory.adjust', async (inputs) => {
    const locationId = toGid('Location', inputs.locationId as string | number);
    const inventoryItemId = toGid('InventoryItem', inputs.inventoryItemId as string | number);
    const delta = Number(inputs.availableDelta);

    const data = await graphql.query<{
      inventoryAdjustQuantities: {
        changes: {
          name: string;
          delta: number;
          quantityAfterChange: number;
          item: { id: string };
          location: { id: string };
        }[];
        userErrors: UserError[];
      };
    }>(INVENTORY_ADJUST, {
      input: {
        reason: 'correction',
        name: 'available',
        changes: [
          {
            delta,
            inventoryItemId,
            locationId,
          },
        ],
      },
    });

    throwOnUserErrors(data.inventoryAdjustQuantities.userErrors, 'inventoryAdjustQuantities');
    return { data: data.inventoryAdjustQuantities.changes };
  });
}
