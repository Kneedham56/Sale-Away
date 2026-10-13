import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photos";
import { applyTemplate, type Specific } from "@/lib/listing-text";
import { buildSku } from "@/lib/sku";
import { getEbayClient } from "./client";
import type { EbayEnv } from "./config";

export type PolicyDefaults = { fulfillment?: string; fulfillment_media?: string; payment?: string; return?: string };

type PublishItem = {
  id: string;
  item_number: number;
  title: string;
  kind: string;
  cost: number | null;
  list_price: number | null;
  date_listed: string | null;
  condition: string | null;
  condition_grade: string | null;
  condition_text: string | null;
  condition_notes: string | null;
  listing_description: string | null;
  item_specifics: Specific[] | null;
  ebay_category_id: string | null;
  ebay_category_name: string | null;
  shipping_policy_id: string | null;
  weight_oz: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  sku: string | null;
  lot_code: string | null;
  date_sourced: string | null;
};

/** eBay condition enum from her condition + grade. Some categories (books, media) accept fewer values. */
export function conditionFor(item: PublishItem): string {
  if (item.condition === "new") return "NEW";
  switch (item.condition_grade) {
    case "excellent":
      return item.kind === "general" ? "USED_EXCELLENT" : "LIKE_NEW";
    case "acceptable":
      return "USED_ACCEPTABLE";
    case "good":
    default:
      return "USED_GOOD";
  }
}

export type PublishCheck = { ok: boolean; problems: string[] };

export function checkReady(item: PublishItem, photoCount: number, policies: PolicyDefaults): PublishCheck {
  const problems: string[] = [];
  if (!item.title || item.title.length > 80) problems.push("Title missing or over 80 characters.");
  if (!item.list_price || Number(item.list_price) <= 0) problems.push("No list price.");
  if (!photoCount) problems.push("No photos.");
  if (!item.ebay_category_id && !item.ebay_category_name) problems.push("No eBay category.");
  if (!item.condition) problems.push("Condition (new / pre-owned) not set.");
  if (!(item.shipping_policy_id || policies.fulfillment)) problems.push("No shipping policy chosen in Settings.");
  if (!policies.payment || !policies.return) problems.push("Payment and return policies not chosen in Settings.");
  if ((item.item_specifics ?? []).some((s) => /^unknown$/i.test(s.value))) problems.push("Some item specifics are still “unknown”.");
  return { ok: problems.length === 0, problems };
}

async function log(ws: string, actor: string | null, action: string, detail: Record<string, unknown>) {
  await createAdminClient().from("activity_log").insert({ workspace_id: ws, actor, action, detail });
}

export type PublishResult = {
  environment: EbayEnv;
  dryRun: boolean;
  sku: string;
  offerId: string | null;
  listingId: string | null;
  url: string | null;
  payload?: unknown;
};

export async function publishItem(
  supabase: SupabaseClient,
  itemId: string,
  env: EbayEnv,
  actor: string | null,
  ws: string
): Promise<PublishResult> {
  const { data: item, error } = await supabase.from("items_view").select("*").eq("id", itemId).single();
  if (error || !item) throw new Error("Item not found.");
  const { data: settingRows } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["ebay_policies", "sku_template", "description_template", "ebay_postal_code"]);
  const settings = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));
  const policies = (settings.ebay_policies ?? {}) as PolicyDefaults;
  const { data: photos } = await supabase
    .from("item_photos")
    .select("storage_path, jpeg_path")
    .eq("item_id", itemId)
    .order("sort_order")
    .order("created_at")
    .limit(24);

  const check = checkReady(item, photos?.length ?? 0, policies);
  if (!check.ok) throw new Error(`Not ready: ${check.problems.join(" ")}`);

  const client = getEbayClient(env, ws);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const sku = item.sku || buildSku(item, String(settings.sku_template ?? ""), item.date_listed ?? today);

  let categoryId: string | null = item.ebay_category_id;
  if (!categoryId) {
    const [best] = await client.suggestCategories(item.ebay_category_name ?? item.title);
    categoryId = best?.categoryId ?? null;
  }
  if (!categoryId) throw new Error("Couldn't find an eBay category for this item.");

  const description = applyTemplate(String(settings.description_template ?? ""), {
    title: item.title,
    description: item.listing_description ?? "",
    condition: item.condition_text ?? item.condition_notes ?? "",
  });
  const aspects = Object.fromEntries(
    (item.item_specifics ?? []).filter((s: Specific) => s.value && !/^unknown$/i.test(s.value)).map((s: Specific) => [s.name, [s.value]])
  );
  const fulfillmentPolicyId =
    item.shipping_policy_id || (item.kind !== "general" && policies.fulfillment_media) || policies.fulfillment!;
  const dims =
    item.length_in && item.width_in && item.height_in
      ? { length: Number(item.length_in), width: Number(item.width_in), height: Number(item.height_in) }
      : null;

  const inventoryItem = {
    sku,
    title: item.title,
    description,
    aspects,
    condition: conditionFor(item),
    conditionDescription: item.condition === "new" ? undefined : item.condition_text ?? item.condition_notes ?? undefined,
    imageUrls: [] as string[],
    weightOz: item.weight_oz ? Number(item.weight_oz) : null,
    dimensionsIn: dims,
  };
  const offer = {
    sku,
    categoryId,
    price: Number(item.list_price),
    listingDescription: description,
    fulfillmentPolicyId,
    paymentPolicyId: policies.payment!,
    returnPolicyId: policies.return!,
    merchantLocationKey: "home",
    bestOffer: true,
  };

  if (env === "mock") {
    return { environment: env, dryRun: true, sku, offerId: null, listingId: null, url: null, payload: { inventoryItem, offer } };
  }

  const recordFailure = async (message: string) => {
    await supabase
      .from("ebay_listings")
      .upsert({ item_id: itemId, environment: env, sku, status: "failed", last_error: message }, { onConflict: "workspace_id,environment,sku" });
    await log(ws, actor, "ebay.publish_failed", { environment: env, itemId, sku, error: message });
  };

  try {
    // Photos: eBay copies each from a short-lived signed link
    const paths = (photos ?? []).map((p) => p.jpeg_path ?? p.storage_path);
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (!s.signedUrl) continue;
      const img = await client.uploadImageFromUrl(s.signedUrl);
      inventoryItem.imageUrls.push(img.imageUrl);
    }
    if (!inventoryItem.imageUrls.length) throw new Error("No photos could be uploaded to eBay.");

    const postal = String(settings.ebay_postal_code ?? "").trim();
    if (!postal) throw new Error("Set the ship-from ZIP code in Settings.");
    await client.ensureLocation("home", postal);
    await client.putInventoryItem(inventoryItem);
    await log(ws, actor, "ebay.inventory_item.put", { environment: env, itemId, sku });
    const offerId = await client.upsertOffer(offer);
    await log(ws, actor, "ebay.offer.upsert", { environment: env, itemId, sku, offerId, price: offer.price });
    const listingId = await client.publishOffer(offerId);
    await log(ws, actor, "ebay.offer.publish", { environment: env, itemId, sku, offerId, listingId });

    await supabase.from("ebay_listings").upsert(
      { item_id: itemId, environment: env, sku, offer_id: offerId, listing_id: listingId, status: "published", last_error: null, published_at: new Date().toISOString() },
      { onConflict: "workspace_id,environment,sku" }
    );
    if (env === "production") {
      await supabase
        .from("items")
        .update({ status: "listed", date_listed: today, sku, ebay_item_id: listingId, ebay_offer_id: offerId })
        .eq("id", itemId);
      await supabase.from("item_events").insert({ item_id: itemId, action: "Published to eBay", note: `Listing ${listingId}` });
    }
    const url = env === "production" ? `https://www.ebay.com/itm/${listingId}` : `https://www.sandbox.ebay.com/itm/${listingId}`;
    return { environment: env, dryRun: false, sku, offerId, listingId, url };
  } catch (e) {
    await recordFailure(e instanceof Error ? e.message : String(e));
    throw e;
  }
}
