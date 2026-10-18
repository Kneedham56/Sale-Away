import "server-only";
import { credentials, ebayEnv, hasCredentials, hosts, MARKETPLACE, SCOPES, type EbayEnv } from "./config";
import { getUserAccessToken } from "./tokens";
import type {
  ActiveListing,
  Aspect,
  BrowseItem,
  CategorySuggestion,
  EbayOrder,
  EbayTransaction,
  InventoryItemPayload,
  OfferPayload,
  Policies,
} from "./types";
import { MockEbayClient } from "./mock";

/** Every eBay call in the app goes through this interface. Pick the implementation with EBAY_ENV. */
export interface EbayClient {
  readonly env: EbayEnv;
  // App-level calls (no seller account needed)
  searchActive(query: string, limit?: number): Promise<BrowseItem[]>;
  suggestCategories(query: string): Promise<CategorySuggestion[]>;
  getAspects(categoryId: string): Promise<Aspect[]>;
  /** eBay condition ids the category accepts (e.g. 1000 New, 3000 Used); empty if eBay doesn't say */
  getConditionIds(categoryId: string): Promise<number[]>;
  // Seller calls (need her connected account)
  getUser(): Promise<{ userId: string; username: string }>;
  getOrders(modifiedSince: string): Promise<EbayOrder[]>;
  /** All her live listings (Trading API GetMyeBaySelling, 200 per page) */
  getActiveListings(): Promise<ActiveListing[]>;
  getTransactions(since: string): Promise<EbayTransaction[]>;
  getPolicies(): Promise<Policies>;
  ensureLocation(key: string, postalCode: string): Promise<void>;
  uploadImageFromUrl(url: string): Promise<{ imageUrl: string; expiresAt: string | null }>;
  putInventoryItem(item: InventoryItemPayload): Promise<void>;
  upsertOffer(offer: OfferPayload): Promise<string>;
  publishOffer(offerId: string): Promise<string>;
  /** Ends a live listing created by the app (Inventory API offer) */
  withdrawOffer(offerId: string): Promise<void>;
  /** Change price on a listing the app published (Inventory API offer) */
  updateOfferPrice(offerId: string, sku: string, price: number): Promise<void>;
  /** Listings made in Seller Hub / the eBay app (Trading API): change price or title, or end it */
  reviseLegacyListing(listingId: string, changes: { price?: number; title?: string }): Promise<void>;
  endLegacyListing(listingId: string): Promise<void>;
}

export class EbayError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// App token (client credentials), cached in memory until shortly before expiry
// ---------------------------------------------------------------------------
const appTokens = new Map<string, { token: string; expiresAt: number }>();

export async function getAppToken(env: Exclude<EbayEnv, "mock">): Promise<string> {
  const cached = appTokens.get(env);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { clientId, clientSecret } = credentials(env);
  if (!clientId || !clientSecret) throw new Error(`eBay ${env} keys are not set.`);
  const res = await fetch(hosts(env).token, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPES.base }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new EbayError(`eBay app token failed: ${body?.error_description ?? res.status}`, res.status, body);
  appTokens.set(env, { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

const policyCache = new Map<string, { at: number; value: Policies }>();

// ---------------------------------------------------------------------------
// REST implementation (sandbox and production)
// ---------------------------------------------------------------------------
class RestEbayClient implements EbayClient {
  private categoryTreeId: string | null = null;
  /** workspaceId: whose eBay account seller calls use (null = app-level calls only) */
  constructor(readonly env: Exclude<EbayEnv, "mock">, private workspaceId: string | null) {}

  private async call<T>(
    path: string,
    opts: { method?: string; body?: unknown; user?: boolean; host?: "api" | "apiz" | "apim"; headers?: Record<string, string> } = {}
  ): Promise<{ data: T; headers: Headers; status: number }> {
    if (opts.user && !this.workspaceId) throw new Error("No business chosen for this eBay call.");
    const token = opts.user ? await getUserAccessToken(this.env, this.workspaceId!) : await getAppToken(this.env);
    const url = `${hosts(this.env)[opts.host ?? "api"]}${path}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "content-language": "en-US",
          "accept-language": "en-US",
          "x-ebay-c-marketplace-id": MARKETPLACE,
          ...opts.headers,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const msg = data?.errors?.[0]?.longMessage ?? data?.errors?.[0]?.message ?? `HTTP ${res.status}`;
        throw new EbayError(`eBay: ${msg}`, res.status, data);
      }
      return { data: data as T, headers: res.headers, status: res.status };
    }
  }

  async searchActive(query: string, limit = 10): Promise<BrowseItem[]> {
    const q = new URLSearchParams({ q: query.slice(0, 100), limit: String(limit), filter: "buyingOptions:{FIXED_PRICE}" });
    const { data } = await this.call<{ itemSummaries?: { title: string; price?: { value: string }; itemWebUrl: string; condition?: string }[] }>(
      `/buy/browse/v1/item_summary/search?${q}`
    );
    return (data.itemSummaries ?? [])
      .filter((i) => i.price?.value)
      .map((i) => ({ title: i.title, price: Number(i.price!.value), url: i.itemWebUrl, condition: i.condition }));
  }

  private async treeId(): Promise<string> {
    if (this.categoryTreeId) return this.categoryTreeId;
    const { data } = await this.call<{ categoryTreeId: string }>(
      `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE}`
    );
    this.categoryTreeId = data.categoryTreeId;
    return data.categoryTreeId;
  }

  async suggestCategories(query: string): Promise<CategorySuggestion[]> {
    const tree = await this.treeId();
    const { data } = await this.call<{
      categorySuggestions?: { category: { categoryId: string; categoryName: string }; categoryTreeNodeAncestors?: { categoryName: string }[] }[];
    }>(`/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions?q=${encodeURIComponent(query.slice(0, 100))}`);
    return (data.categorySuggestions ?? []).map((s) => ({
      categoryId: s.category.categoryId,
      categoryName: s.category.categoryName,
      path: [...(s.categoryTreeNodeAncestors ?? []).map((a) => a.categoryName).reverse(), s.category.categoryName].join(" > "),
    }));
  }

  async getAspects(categoryId: string): Promise<Aspect[]> {
    const tree = await this.treeId();
    const { data } = await this.call<{
      aspects?: { localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean }; aspectValues?: { localizedValue: string }[] }[];
    }>(`/commerce/taxonomy/v1/category_tree/${tree}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`);
    return (data.aspects ?? []).map((a) => ({
      name: a.localizedAspectName,
      required: !!a.aspectConstraint?.aspectRequired,
      values: (a.aspectValues ?? []).slice(0, 50).map((v) => v.localizedValue),
    }));
  }

  async getConditionIds(categoryId: string): Promise<number[]> {
    const { data } = await this.call<{ itemConditionPolicies?: { itemConditions?: { conditionId: string }[] }[] }>(
      `/sell/metadata/v1/marketplace/${MARKETPLACE}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`
    );
    return (data.itemConditionPolicies?.[0]?.itemConditions ?? []).map((c) => Number(c.conditionId)).filter(Number.isFinite);
  }

  async getUser() {
    const { data } = await this.call<{ userId: string; username: string }>("/commerce/identity/v1/user/", { user: true, host: "apiz" });
    return data;
  }

  async getOrders(modifiedSince: string): Promise<EbayOrder[]> {
    const out: EbayOrder[] = [];
    for (let offset = 0; ; offset += 200) {
      const q = new URLSearchParams({ filter: `lastmodifieddate:[${modifiedSince}..]`, limit: "200", offset: String(offset) });
      const { data } = await this.call<{ orders?: EbayOrder[]; total?: number }>(`/sell/fulfillment/v1/order?${q}`, { user: true });
      out.push(...(data.orders ?? []));
      if (!data.orders?.length || out.length >= (data.total ?? 0)) return out;
    }
  }

  async getActiveListings(): Promise<ActiveListing[]> {
    // The REST Inventory API only sees listings it created; her Seller Hub listings need the Trading API
    const token = await getUserAccessToken(this.env, this.workspaceId!);
    const out: ActiveListing[] = [];
    const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1] ?? null;
    const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    for (let page = 1; page <= 200; page++) {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;
      const res = await fetch(`${hosts(this.env).api}/ws/api.dll`, {
        method: "POST",
        headers: {
          "X-EBAY-API-IAF-TOKEN": token,
          "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
          "X-EBAY-API-SITEID": "0",
          "X-EBAY-API-COMPATIBILITY-LEVEL": "1371",
          "Content-Type": "text/xml",
        },
        body,
      });
      const xml = await res.text();
      const ack = tag(xml, "Ack");
      if (!res.ok || (ack !== "Success" && ack !== "Warning")) {
        throw new EbayError(`eBay listings: ${tag(xml, "LongMessage") ?? `HTTP ${res.status}`}`, res.status, xml.slice(0, 500));
      }
      const active = xml.match(/<ActiveList>([\s\S]*?)<\/ActiveList>/)?.[1] ?? "";
      for (const m of active.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
        const it = m[1];
        const id = tag(it, "ItemID");
        if (!id) continue;
        const price = tag(it, "CurrentPrice") ?? tag(it, "BuyItNowPrice");
        out.push({
          listingId: id,
          title: unescape(tag(it, "Title") ?? ""),
          sku: tag(it, "SKU") ? unescape(tag(it, "SKU")!) : null,
          price: price === null ? null : Number(price),
          quantityAvailable: tag(it, "QuantityAvailable") === null ? null : Number(tag(it, "QuantityAvailable")),
          startTime: tag(it, "StartTime"),
        });
      }
      const pages = Number(active.match(/<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/)?.[1] ?? 1);
      if (page >= pages) break;
    }
    return out;
  }

  async getTransactions(since: string): Promise<EbayTransaction[]> {
    const out: EbayTransaction[] = [];
    for (let offset = 0; ; offset += 1000) {
      const q = new URLSearchParams({ filter: `transactionDate:[${since}..]`, limit: "1000", offset: String(offset) });
      const { data } = await this.call<{ transactions?: EbayTransaction[]; total?: number }>(`/sell/finances/v1/transaction?${q}`, {
        user: true,
        host: "apiz",
      });
      out.push(...(data.transactions ?? []));
      if (!data.transactions?.length || out.length >= (data.total ?? 0)) return out;
    }
  }

  async getPolicies(): Promise<Policies> {
    const get = async (kind: "fulfillment" | "payment" | "return") => {
      const { data } = await this.call<Record<string, { name: string; description?: string; [k: string]: unknown }[]>>(
        `/sell/account/v1/${kind}_policy?marketplace_id=${MARKETPLACE}`,
        { user: true }
      );
      const list = data[`${kind}Policies`] ?? [];
      return list.map((p) => {
        const options = (p.shippingOptions as { costType?: string }[] | undefined) ?? [];
        return {
          id: String(p[`${kind}PolicyId`]),
          name: p.name,
          description: p.description,
          needsPackage: options.some((o) => o.costType === "CALCULATED"),
        };
      });
    };
    // Policies rarely change: keep them for 10 minutes instead of 3 eBay calls on every item page
    const cached = policyCache.get(`${this.env}:${this.workspaceId}`);
    if (cached && cached.at > Date.now() - 10 * 60_000) return cached.value;
    const [fulfillment, payment, ret] = await Promise.all([get("fulfillment"), get("payment"), get("return")]);
    const value = { fulfillment, payment, return: ret };
    policyCache.set(`${this.env}:${this.workspaceId}`, { at: Date.now(), value });
    return value;
  }

  async ensureLocation(key: string, postalCode: string): Promise<void> {
    try {
      await this.call(`/sell/inventory/v1/location/${encodeURIComponent(key)}`, { user: true });
    } catch (e) {
      if (!(e instanceof EbayError) || e.status !== 404) throw e;
      await this.call(`/sell/inventory/v1/location/${encodeURIComponent(key)}`, {
        user: true,
        method: "POST",
        body: { location: { address: { postalCode, country: "US" } }, locationTypes: ["WAREHOUSE"], name: "Home" },
      });
    }
  }

  async uploadImageFromUrl(url: string) {
    const created = await this.call<null>("/commerce/media/v1_beta/image/create_image_from_url", {
      user: true,
      host: "apim",
      method: "POST",
      body: { imageUrl: url },
    });
    const location = created.headers.get("location");
    if (!location) throw new Error("eBay didn't return an image location.");
    const imageId = location.split("/").pop()!;
    const { data } = await this.call<{ imageUrl: string; expirationDate?: string }>(`/commerce/media/v1_beta/image/${imageId}`, {
      user: true,
      host: "apim",
    });
    return { imageUrl: data.imageUrl, expiresAt: data.expirationDate ?? null };
  }

  async putInventoryItem(item: InventoryItemPayload): Promise<void> {
    const body: Record<string, unknown> = {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: item.condition,
      conditionDescription: item.conditionDescription?.slice(0, 1000),
      product: { title: item.title, description: item.description, aspects: item.aspects, imageUrls: item.imageUrls },
    };
    if (item.weightOz || item.dimensionsIn) {
      body.packageWeightAndSize = {
        ...(item.weightOz ? { weight: { value: item.weightOz, unit: "OUNCE" } } : {}),
        ...(item.dimensionsIn ? { dimensions: { ...item.dimensionsIn, unit: "INCH" } } : {}),
      };
    }
    await this.call(`/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`, { user: true, method: "PUT", body });
  }

  async upsertOffer(o: OfferPayload): Promise<string> {
    const body = {
      sku: o.sku,
      marketplaceId: MARKETPLACE,
      format: "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: o.categoryId,
      listingDescription: o.listingDescription,
      merchantLocationKey: o.merchantLocationKey,
      pricingSummary: { price: { value: o.price.toFixed(2), currency: "USD" } },
      listingPolicies: {
        fulfillmentPolicyId: o.fulfillmentPolicyId,
        paymentPolicyId: o.paymentPolicyId,
        returnPolicyId: o.returnPolicyId,
        bestOfferTerms: { bestOfferEnabled: o.bestOffer },
      },
    };
    const existing = await this.call<{ offers?: { offerId: string }[] }>(
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(o.sku)}&marketplace_id=${MARKETPLACE}`,
      { user: true }
    ).catch((e) => {
      if (e instanceof EbayError && e.status === 404) return { data: { offers: [] } };
      throw e;
    });
    const offerId = existing.data.offers?.[0]?.offerId;
    if (offerId) {
      await this.call(`/sell/inventory/v1/offer/${offerId}`, { user: true, method: "PUT", body });
      return offerId;
    }
    const { data } = await this.call<{ offerId: string }>("/sell/inventory/v1/offer", { user: true, method: "POST", body });
    return data.offerId;
  }

  async publishOffer(offerId: string): Promise<string> {
    const { data } = await this.call<{ listingId: string }>(`/sell/inventory/v1/offer/${offerId}/publish`, { user: true, method: "POST" });
    return data.listingId;
  }

  async withdrawOffer(offerId: string): Promise<void> {
    await this.call(`/sell/inventory/v1/offer/${offerId}/withdraw`, { user: true, method: "POST" });
  }

  async updateOfferPrice(offerId: string, sku: string, price: number): Promise<void> {
    const { data } = await this.call<{ responses?: { statusCode: number; errors?: { message: string }[] }[] }>(
      "/sell/inventory/v1/bulk_update_price_quantity",
      {
        user: true,
        method: "POST",
        body: { requests: [{ sku, offers: [{ offerId, availableQuantity: 1, price: { value: price.toFixed(2), currency: "USD" } }] }] },
      }
    );
    const bad = data.responses?.find((r) => r.statusCode >= 300);
    if (bad) throw new EbayError(`eBay: ${bad.errors?.[0]?.message ?? "price update failed"}`, bad.statusCode, data);
  }

  /** One Trading API (XML) call; listings made outside the Inventory API can only be changed this way. */
  private async trading(callName: string, inner: string): Promise<string> {
    const token = await getUserAccessToken(this.env, this.workspaceId!);
    const res = await fetch(`${hosts(this.env).api}/ws/api.dll`, {
      method: "POST",
      headers: {
        "X-EBAY-API-IAF-TOKEN": token,
        "X-EBAY-API-CALL-NAME": callName,
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1371",
        "Content-Type": "text/xml",
      },
      body: `<?xml version="1.0" encoding="utf-8"?><${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">${inner}</${callName}Request>`,
    });
    const xml = await res.text();
    const ack = xml.match(/<Ack>(\w+)<\/Ack>/)?.[1];
    if (!res.ok || (ack !== "Success" && ack !== "Warning")) {
      const code = xml.match(/<ErrorCode>(\d+)<\/ErrorCode>/)?.[1];
      const msg = xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ?? `HTTP ${res.status}`;
      throw new EbayError(`eBay: ${msg}`, Number(code) || res.status, xml.slice(0, 500));
    }
    return xml;
  }

  async reviseLegacyListing(listingId: string, changes: { price?: number; title?: string }): Promise<void> {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const parts = [
      `<ItemID>${esc(listingId)}</ItemID>`,
      changes.price !== undefined ? `<StartPrice>${changes.price.toFixed(2)}</StartPrice>` : "",
      changes.title ? `<Title>${esc(changes.title.slice(0, 80))}</Title>` : "",
    ];
    await this.trading("ReviseFixedPriceItem", `<Item>${parts.join("")}</Item>`);
  }

  async endLegacyListing(listingId: string): Promise<void> {
    try {
      await this.trading("EndFixedPriceItem", `<ItemID>${listingId}</ItemID><EndingReason>NotAvailable</EndingReason>`);
    } catch (e) {
      // 1047 = already ended (e.g. FLYP got there first): that's the outcome we wanted
      if (e instanceof EbayError && e.status === 1047) return;
      throw e;
    }
  }
}

const clients = new Map<string, EbayClient>();

/** The client for an environment and business (seller calls use that business's connected eBay account). */
export function getEbayClient(env: EbayEnv = ebayEnv(), workspaceId: string | null = null): EbayClient {
  const k = `${env}:${workspaceId ?? "app"}`;
  let c = clients.get(k);
  if (!c) {
    c = env === "mock" ? new MockEbayClient() : new RestEbayClient(env, workspaceId);
    clients.set(k, c);
  }
  return c;
}

/**
 * App-level client for Browse/Taxonomy. eBay recommends production for search even while
 * the seller side is in sandbox, so this prefers production keys whenever they exist.
 */
export function getAppLevelClient(): EbayClient | null {
  if (hasCredentials("production")) return getEbayClient("production");
  const env = ebayEnv();
  if (env === "sandbox" && hasCredentials("sandbox")) return getEbayClient("sandbox");
  return null;
}
