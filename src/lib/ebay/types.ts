// The slices of eBay's REST responses the app uses. Field names follow eBay's documentation.

export type Money = { value: string; currency: string };

export type EbayLineItem = {
  lineItemId: string;
  legacyItemId?: string;
  sku?: string;
  title: string;
  quantity: number;
  lineItemCost?: Money;
  total?: Money;
  deliveryCost?: { shippingCost?: Money };
  lineItemFulfillmentInstructions?: { shipByDate?: string; guaranteedDelivery?: boolean };
  lineItemFulfillmentStatus?: "NOT_STARTED" | "IN_PROGRESS" | "FULFILLED";
};

export type EbayOrder = {
  orderId: string;
  creationDate: string;
  lastModifiedDate: string;
  orderFulfillmentStatus: "NOT_STARTED" | "IN_PROGRESS" | "FULFILLED";
  orderPaymentStatus?: "PAID" | "PENDING" | "FAILED" | "FULLY_REFUNDED" | "PARTIALLY_REFUNDED";
  cancelStatus?: { cancelState?: "NONE_REQUESTED" | "IN_PROGRESS" | "CANCELED" };
  buyer?: { username?: string };
  pricingSummary?: { total?: Money; deliveryCost?: Money };
  lineItems: EbayLineItem[];
  fulfillmentStartInstructions?: {
    shippingStep?: {
      shippingServiceCode?: string;
      shipTo?: {
        fullName?: string;
        contactAddress?: {
          addressLine1?: string;
          addressLine2?: string;
          city?: string;
          stateOrProvince?: string;
          postalCode?: string;
          countryCode?: string;
        };
      };
    };
  }[];
};

export type EbayTransaction = {
  transactionId: string;
  orderId?: string;
  transactionType: "SALE" | "REFUND" | "SHIPPING_LABEL" | "CREDIT" | "DISPUTE" | "NON_SALE_CHARGE" | "TRANSFER" | "ADJUSTMENT" | string;
  transactionDate: string;
  bookingEntry: "CREDIT" | "DEBIT";
  amount: Money;
  totalFeeAmount?: Money;
  references?: { referenceId: string; referenceType: string }[];
  orderLineItems?: { lineItemId: string; marketplaceFees?: { feeType: string; amount: Money }[] }[];
};

/** One of her live eBay listings (any listing, including ones made in Seller Hub or the eBay app) */
export type ActiveListing = {
  listingId: string;
  title: string;
  sku: string | null;
  price: number | null;
  quantityAvailable: number | null;
  startTime: string | null;
};

export type BrowseItem = { title: string; price: number; url: string; condition?: string };

export type CategorySuggestion = { categoryId: string; categoryName: string; path: string };

export type Aspect = { name: string; required: boolean; values: string[] };

/** `needsPackage`: calculated shipping, so eBay requires the package weight and size on the listing */
export type Policy = { id: string; name: string; description?: string; needsPackage?: boolean };
export type Policies = { fulfillment: Policy[]; payment: Policy[]; return: Policy[] };

export type InventoryItemPayload = {
  sku: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  condition: string;
  conditionDescription?: string;
  imageUrls: string[];
  weightOz?: number | null;
  dimensionsIn?: { length: number; width: number; height: number } | null;
};

export type OfferPayload = {
  sku: string;
  categoryId: string;
  price: number;
  listingDescription: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
  bestOffer: boolean;
};
