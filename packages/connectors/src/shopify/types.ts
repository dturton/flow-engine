/** GraphQL connection shape returned by Shopify list queries. */
export interface ShopifyConnection<T> {
  edges: { node: T }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface ShopifyMoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyMetafield {
  id: string;
  namespace: string;
  key: string;
  value: string;
  type: string;
  description: string | null;
  ownerType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  handle: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  tags: string[];
  templateSuffix: string | null;
  isGiftCard: boolean;
  hasOnlyDefaultVariant: boolean;
  hasOutOfStockVariants: boolean;
  tracksInventory: boolean;
  totalInventory: number;
  totalVariants: number;
  onlineStoreUrl: string | null;
  onlineStorePreviewUrl: string | null;
  options: ShopifyProductOption[];
  priceRangeV2: {
    minVariantPrice: ShopifyMoneyV2;
    maxVariantPrice: ShopifyMoneyV2;
  };
  featuredImage: ShopifyImage | null;
  seo: { title: string | null; description: string | null };
  metafields: ShopifyConnection<ShopifyMetafield>;
  variants: ShopifyConnection<ShopifyVariant>;
  images: ShopifyConnection<ShopifyImage>;
  collections: ShopifyConnection<{ id: string; title: string }>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ShopifyProductOption {
  id: string;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyVariant {
  id: string;
  title: string;
  displayName: string;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
  availableForSale: boolean;
  inventoryQuantity: number;
  inventoryPolicy: 'DENY' | 'CONTINUE';
  inventoryItem: { id: string; tracked: boolean };
  weight: number | null;
  weightUnit: 'GRAMS' | 'KILOGRAMS' | 'OUNCES' | 'POUNDS';
  requiresShipping: boolean;
  taxable: boolean;
  taxCode: string | null;
  position: number;
  selectedOptions: { name: string; value: string }[];
  image: ShopifyImage | null;
  metafields: ShopifyConnection<ShopifyMetafield>;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyImage {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
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
