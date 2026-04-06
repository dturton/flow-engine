/**
 * TypeScript interfaces mirroring the Shopify GraphQL Admin API object shapes.
 * These are used to type the responses from GraphQL queries in the operation modules.
 */

/** GraphQL connection shape returned by Shopify list queries (Relay-style pagination). */
export interface ShopifyConnection<T> {
  edges: { node: T }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface ShopifyProduct {
  id: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string;
  productType: string;
  handle: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  tags: string[];
  variants: ShopifyConnection<ShopifyVariant>;
  images: ShopifyConnection<ShopifyImage>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  inventoryQuantity: number;
  weight: number | null;
  weightUnit: string;
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText: string | null;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  lineItems: ShopifyConnection<ShopifyLineItem>;
  customer: ShopifyCustomer | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  sku: string | null;
  product: { id: string } | null;
  variant: { id: string } | null;
}

export interface ShopifyCustomer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  numberOfOrders: string;
  amountSpent: { amount: string; currencyCode: string };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyInventoryLevel {
  id: string;
  quantities: { name: string; quantity: number }[];
  item: { id: string };
  location: { id: string };
  updatedAt: string;
}

export interface ShopifyDraftOrder {
  id: string;
  name: string;
  order: { id: string } | null;
  createdAt: string;
  updatedAt: string;
}
