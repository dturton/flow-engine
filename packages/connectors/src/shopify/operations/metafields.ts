import type { OperationHandler } from '../../base/types.js';
import type { ShopifyGraphQLClient } from '../graphql-client.js';
import type { ShopifyMetafield, ShopifyConnection } from '../types.js';
import { toGid, flattenEdges, toPageInfo, throwOnUserErrors } from './helpers.js';
import type { UserError } from '../graphql-client.js';

const METAFIELD_FRAGMENT = `
  fragment MetafieldFields on Metafield {
    id
    namespace
    key
    value
    type
    description
    ownerType
    createdAt
    updatedAt
  }
`;

/** Fetch a single metafield by namespace and key on any resource. */
const METAFIELD_GET = `
  ${METAFIELD_FRAGMENT}
  query metafield($ownerId: ID!, $namespace: String!, $key: String!) {
    node(id: $ownerId) {
      ... on HasMetafields {
        metafield(namespace: $namespace, key: $key) {
          ...MetafieldFields
        }
      }
    }
  }
`;

/** List metafields on any resource. */
const METAFIELDS_LIST = `
  ${METAFIELD_FRAGMENT}
  query metafields($ownerId: ID!, $first: Int!, $after: String, $namespace: String) {
    node(id: $ownerId) {
      ... on HasMetafields {
        metafields(first: $first, after: $after, namespace: $namespace) {
          edges { node { ...MetafieldFields } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

/** Set one or more metafields on any resource via metafieldsSet. */
const METAFIELDS_SET = `
  ${METAFIELD_FRAGMENT}
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { ...MetafieldFields }
      userErrors { field message }
    }
  }
`;

/** Delete a metafield by ID. */
const METAFIELD_DELETE = `
  mutation metafieldDelete($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

export interface MetafieldSetInput {
  /** GID of the resource that owns the metafield (e.g. Product, Variant, Order). */
  ownerId: string;
  namespace: string;
  key: string;
  /** The metafield value as a string. JSON values should be pre-serialized. */
  value: string;
  /** Shopify metafield type (e.g. "single_line_text_field", "number_integer", "json"). */
  type: string;
}

export function registerMetafieldOperations(
  ops: Map<string, OperationHandler>,
  graphql: ShopifyGraphQLClient,
): void {
  /**
   * Get a single metafield by owner + namespace + key.
   *
   * Inputs: { ownerId, ownerResource?, namespace, key }
   * ownerResource defaults to "Product" for GID conversion when ownerId is numeric.
   */
  ops.set('metafields.get', async (inputs) => {
    const ownerResource = (inputs.ownerResource as string) ?? 'Product';
    const ownerId = toGid(ownerResource, inputs.ownerId as string | number);
    const namespace = inputs.namespace as string;
    const key = inputs.key as string;

    const data = await graphql.query<{
      node: { metafield: ShopifyMetafield | null } | null;
    }>(METAFIELD_GET, { ownerId, namespace, key });

    return { data: data.node?.metafield ?? null };
  });

  /**
   * List metafields on a resource. Optionally filter by namespace.
   *
   * Inputs: { ownerId, ownerResource?, namespace?, limit?, pageInfo? }
   */
  ops.set('metafields.list', async (inputs) => {
    const ownerResource = (inputs.ownerResource as string) ?? 'Product';
    const ownerId = toGid(ownerResource, inputs.ownerId as string | number);
    const first = inputs.limit != null ? Number(inputs.limit) : 50;
    const pageInfo = inputs.pageInfo as { cursor?: string } | undefined;
    const namespace = inputs.namespace as string | undefined;

    const data = await graphql.query<{
      node: { metafields: ShopifyConnection<ShopifyMetafield> } | null;
    }>(METAFIELDS_LIST, {
      ownerId,
      first,
      after: pageInfo?.cursor,
      namespace,
    });

    const metafields = data.node?.metafields;
    if (!metafields) return { data: [], pageInfo: null };

    return {
      data: flattenEdges(metafields),
      pageInfo: toPageInfo(metafields.pageInfo),
    };
  });

  /**
   * Set (create or update) one or more metafields.
   *
   * Inputs: { metafields: MetafieldSetInput[] }
   *   or a single metafield: { ownerId, ownerResource?, namespace, key, value, type }
   */
  ops.set('metafields.set', async (inputs) => {
    let metafields: MetafieldSetInput[];

    if (Array.isArray(inputs.metafields)) {
      metafields = inputs.metafields as MetafieldSetInput[];
    } else {
      const ownerResource = (inputs.ownerResource as string) ?? 'Product';
      metafields = [
        {
          ownerId: toGid(ownerResource, inputs.ownerId as string | number),
          namespace: inputs.namespace as string,
          key: inputs.key as string,
          value: inputs.value as string,
          type: inputs.type as string,
        },
      ];
    }

    const data = await graphql.query<{
      metafieldsSet: {
        metafields: ShopifyMetafield[];
        userErrors: UserError[];
      };
    }>(METAFIELDS_SET, { metafields });

    throwOnUserErrors(data.metafieldsSet.userErrors, 'metafieldsSet');
    return { data: data.metafieldsSet.metafields };
  });

  /**
   * Delete a metafield by its ID.
   *
   * Inputs: { id }
   */
  ops.set('metafields.delete', async (inputs) => {
    const id = toGid('Metafield', inputs.id as string | number);

    const data = await graphql.query<{
      metafieldDelete: { deletedId: string; userErrors: UserError[] };
    }>(METAFIELD_DELETE, { input: { id } });

    throwOnUserErrors(data.metafieldDelete.userErrors, 'metafieldDelete');
    return { deleted: true, id: data.metafieldDelete.deletedId };
  });
}
