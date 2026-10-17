import "server-only";
import type { EbayClient } from "./client";
import type { ActiveListing, Aspect, BrowseItem, CategorySuggestion, EbayOrder, EbayTransaction, InventoryItemPayload, OfferPayload, Policies } from "./types";

const money = (v: number) => ({ value: v.toFixed(2), currency: "USD" });

/** Fixtures shaped like eBay's documented responses: a new order, a multi-item order, a refund, a cancellation, an unknown listing. */
export function mockOrders(now = new Date()): EbayOrder[] {
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
  const shipTo = (name: string, city: string, state: string, zip: string) => [
    {
      shippingStep: {
        shippingServiceCode: "USPSGroundAdvantage",
        shipTo: { fullName: name, contactAddress: { addressLine1: "123 Test St", city, stateOrProvince: state, postalCode: zip, countryCode: "US" } },
      },
    },
  ];
  return [
    {
      orderId: "MOCK-10001",
      creationDate: iso(3),
      lastModifiedDate: iso(3),
      orderFulfillmentStatus: "NOT_STARTED",
      orderPaymentStatus: "PAID",
      buyer: { username: "mock_buyer_one" },
      pricingSummary: { total: money(31.49) },
      lineItems: [
        {
          lineItemId: "MOCK-L1",
          legacyItemId: "100000000001",
          sku: "MOCK-SKU-1",
          title: "Vintage Pyrex Butterprint Mixing Bowl 403 Turquoise 2.5 Qt",
          quantity: 1,
          lineItemCost: money(24.99),
          deliveryCost: { shippingCost: money(6.5) },
          lineItemFulfillmentInstructions: { shipByDate: iso(-48) },
        },
      ],
      fulfillmentStartInstructions: shipTo("Pat Buyer", "Reno", "NV", "89501"),
    },
    {
      orderId: "MOCK-10002",
      creationDate: iso(20),
      lastModifiedDate: iso(20),
      orderFulfillmentStatus: "NOT_STARTED",
      orderPaymentStatus: "PAID",
      buyer: { username: "mock_buyer_two" },
      pricingSummary: { total: money(42.0) },
      lineItems: [
        { lineItemId: "MOCK-L2", legacyItemId: "100000000002", title: "Lot of 4 Goosebumps Paperback Books R.L. Stine 1990s", quantity: 1, lineItemCost: money(18), lineItemFulfillmentInstructions: { shipByDate: iso(-24) } },
        { lineItemId: "MOCK-L3", legacyItemId: "100000000003", title: "Disney Store Stitch Plush 12in Lilo & Stitch Blue Stuffed Animal", quantity: 1, lineItemCost: money(16), lineItemFulfillmentInstructions: { shipByDate: iso(-24) } },
      ],
      fulfillmentStartInstructions: shipTo("Sam Shopper", "Austin", "TX", "78701"),
    },
    {
      orderId: "MOCK-10003",
      creationDate: iso(200),
      lastModifiedDate: iso(10),
      orderFulfillmentStatus: "FULFILLED",
      orderPaymentStatus: "FULLY_REFUNDED",
      buyer: { username: "mock_buyer_three" },
      pricingSummary: { total: money(19.99) },
      lineItems: [{ lineItemId: "MOCK-L4", legacyItemId: "100000000004", title: "Coach Leather Wallet Brown Bifold Mens", quantity: 1, lineItemCost: money(19.99) }],
    },
    {
      orderId: "MOCK-10004",
      creationDate: iso(30),
      lastModifiedDate: iso(28),
      orderFulfillmentStatus: "NOT_STARTED",
      orderPaymentStatus: "FULLY_REFUNDED",
      cancelStatus: { cancelState: "CANCELED" },
      buyer: { username: "mock_buyer_four" },
      pricingSummary: { total: money(12.5) },
      lineItems: [{ lineItemId: "MOCK-L5", legacyItemId: "100000000005", title: "Hallmark Keepsake Ornament 1998 Snoopy", quantity: 1, lineItemCost: money(12.5) }],
    },
    {
      orderId: "MOCK-10005",
      creationDate: iso(5),
      lastModifiedDate: iso(5),
      orderFulfillmentStatus: "NOT_STARTED",
      orderPaymentStatus: "PAID",
      buyer: { username: "mock_buyer_five" },
      pricingSummary: { total: money(55) },
      lineItems: [{ lineItemId: "MOCK-L6", legacyItemId: "999999999999", title: "A listing the app has never seen", quantity: 1, lineItemCost: money(55), lineItemFulfillmentInstructions: { shipByDate: iso(-72) } }],
      fulfillmentStartInstructions: shipTo("Lee Unknown", "Boise", "ID", "83702"),
    },
  ];
}

export function mockTransactions(now = new Date()): EbayTransaction[] {
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
  const sale = (orderId: string, lineItemId: string, amount: number, fee: number): EbayTransaction => ({
    transactionId: `T-${orderId}`,
    orderId,
    transactionType: "SALE",
    transactionDate: iso(2),
    bookingEntry: "CREDIT",
    amount: money(amount - fee),
    totalFeeAmount: money(fee),
    orderLineItems: [{ lineItemId, marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: money(fee) }] }],
  });
  return [
    sale("MOCK-10001", "MOCK-L1", 31.49, 4.42),
    sale("MOCK-10002", "MOCK-L2", 42, 5.91),
    { transactionId: "T-LABEL-10001", orderId: "MOCK-10001", transactionType: "SHIPPING_LABEL", transactionDate: iso(1), bookingEntry: "DEBIT", amount: money(5.87) },
    { transactionId: "T-REFUND-10003", orderId: "MOCK-10003", transactionType: "REFUND", transactionDate: iso(10), bookingEntry: "DEBIT", amount: money(19.99) },
  ];
}

export class MockEbayClient implements EbayClient {
  readonly env = "mock" as const;
  // No fake comps: the AI must never price from invented data
  async searchActive(): Promise<BrowseItem[]> {
    return [];
  }
  async suggestCategories(query: string): Promise<CategorySuggestion[]> {
    return [{ categoryId: "0", categoryName: query.slice(0, 40), path: `Mock > ${query.slice(0, 40)}` }];
  }
  async getConditionIds(): Promise<number[]> {
    return [1000, 3000, 7000];
  }
  async getAspects(): Promise<Aspect[]> {
    return [
      { name: "Brand", required: true, values: [] },
      { name: "Type", required: false, values: [] },
    ];
  }
  async getUser() {
    return { userId: "mock-user", username: "mock_seller" };
  }
  async getActiveListings(): Promise<ActiveListing[]> {
    return [];
  }
  async getOrders(): Promise<EbayOrder[]> {
    return mockOrders();
  }
  async getTransactions(): Promise<EbayTransaction[]> {
    return mockTransactions();
  }
  async getPolicies(): Promise<Policies> {
    return {
      fulfillment: [
        { id: "mock-ship-1", name: "USPS Ground Advantage, buyer pays" },
        { id: "mock-ship-2", name: "Media Mail, buyer pays" },
      ],
      payment: [{ id: "mock-pay-1", name: "eBay Managed Payments" }],
      return: [{ id: "mock-ret-1", name: "30 day returns, buyer pays" }, { id: "mock-ret-2", name: "No returns" }],
    };
  }
  async ensureLocation() {}
  async uploadImageFromUrl(url: string) {
    return { imageUrl: url, expiresAt: null };
  }
  async putInventoryItem(item: InventoryItemPayload) {
    void item;
  }
  async upsertOffer(o: OfferPayload) {
    return `mock-offer-${o.sku}`;
  }
  async publishOffer(offerId: string) {
    return `mock-listing-${offerId.replace("mock-offer-", "")}`;
  }
  async withdrawOffer() {}
}
