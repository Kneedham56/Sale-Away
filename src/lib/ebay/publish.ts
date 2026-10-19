import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_BUCKET } from "@/lib/photos";
import { applyTemplate, type Specific } from "@/lib/listing-text";
import { buildSku, withItemNumber } from "@/lib/sku";
import { FormError } from "@/lib/form";
import { cleanMeasurements, measurementsText } from "@/lib/measurements";
import { getEbayClient } from "./client";
import { ebayProblem } from "./errors";
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
  return_policy_id?: string | null;
  weight_oz: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  measurements?: unknown;
  sku: string | null;
  lot_code: string | null;
  date_sourced: string | null;
};

/** eBay condition enum from her condition + grade. Some categories (books, media) accept fewer values. */
// eBay condition ids and the Inventory API names for them
const CONDITION_ENUM: Record<number, string> = {
  1000: "NEW", 1500: "NEW_OTHER", 1750: "NEW_WITH_DEFECTS", 2750: "LIKE_NEW", 2990: "PRE_OWNED_EXCELLENT",
  3000: "USED_EXCELLENT", 3010: "PRE_OWNED_FAIR", 4000: "USED_VERY_GOOD", 5000: "USED_GOOD", 6000: "USED_ACCEPTABLE",
  7000: "FOR_PARTS_OR_NOT_WORKING",
};

/** Her condition + grade, best match first. 3000 is eBay's plain "Used" in many categories. */
function conditionPreferences(item: Pick<PublishItem, "condition" | "condition_grade">): number[] {
  if (item.condition === "new") return [1000, 1500, 2750];
  switch (item.condition_grade) {
    case "excellent":
      return [2990, 2750, 4000, 3000, 5000];
    case "acceptable":
      return [6000, 3010, 5000, 3000];
    case "good":
    default:
      return [5000, 4000, 3000, 2990, 6000];
  }
}

/**
 * The eBay condition for this item that the category actually accepts (eBay rejects others at publish time).
 * `allowed` comes from eBay's Metadata API; if it's empty we fall back to the first preference.
 */
export function conditionFor(item: Pick<PublishItem, "condition" | "condition_grade">, allowed: number[] = []): string {
  const prefs = conditionPreferences(item);
  const pick = allowed.length ? prefs.find((id) => allowed.includes(id)) ?? (item.condition === "new" ? allowed[0] : allowed.find((id) => id >= 2750 && id < 7000) ?? allowed[0]) : prefs[0];
  return CONDITION_ENUM[pick] ?? "USED_EXCELLENT";
}

export type PublishCheck = { ok: boolean; problems: string[] };

export function checkReady(item: PublishItem, photoCount: number, policies: PolicyDefaults): PublishCheck {
  const problems: string[] = [];
  if (!item.title || item.title.length > 80) problems.push("Title missing or over 80 characters.");
  if (!item.list_price || Number(item.list_price) <= 0) problems.push("No list price.");
  if (!photoCount) problems.push("No photos.");
  if (!item.ebay_category_id && !item.ebay_category_name) problems.push("No eBay category.");
  if (!item.condition) problems.push("Condition (new / pre-owned) not set.");
  if (!(item.shipping_policy_id || policies.fulfillment)) problems.push("Pick a shipping policy.");
  if (!policies.payment) problems.push("Pick your usual payment policy (Settings → eBay).");
  if (!(item.return_policy_id || policies.return)) problems.push("Pick a return policy.");
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
  // Re-posting reuses the SKU it was live under; otherwise her label (typed or built) plus the item number
  const { data: own } = await supabase
    .from("ebay_listings")
    .select("sku, offer_id")
    .eq("item_id", itemId)
    .eq("environment", env === "mock" ? "sandbox" : env)
    .not("offer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sku =
    own?.sku ??
    (item.sku ? withItemNumber(item.sku, item.item_number) : buildSku(item, String(settings.sku_template ?? ""), item.date_listed ?? today));

  let categoryId: string | null = item.ebay_category_id;
  if (!categoryId) {
    const [best] = await client.suggestCategories(item.ebay_category_name ?? item.title);
    categoryId = best?.categoryId ?? null;
  }
  if (!categoryId) throw new Error("Couldn't find an eBay category for this item.");

  const measured = measurementsText(cleanMeasurements(item.measurements));
  const description = [
    applyTemplate(String(settings.description_template ?? ""), {
      title: item.title,
      description: item.listing_description ?? "",
      condition: item.condition_text ?? item.condition_notes ?? "",
    }),
    measured,
  ]
    .filter(Boolean)
    .join("\n\n");
  const aspects = Object.fromEntries(
    (item.item_specifics ?? []).filter((s: Specific) => s.value && !/^unknown$/i.test(s.value)).map((s: Specific) => [s.name, [s.value]])
  );
  const fulfillmentPolicyId =
    item.shipping_policy_id || (item.kind !== "general" && policies.fulfillment_media) || policies.fulfillment!;
  const dims =
    item.length_in && item.width_in && item.height_in
      ? { length: Number(item.length_in), width: Number(item.width_in), height: Number(item.height_in) }
      : null;

  // Calculated-shipping policies: eBay won't publish without the package weight and size
  const chosenPolicy = (await client.getPolicies().catch(() => null))?.fulfillment.find((pp) => pp.id === fulfillmentPolicyId);
  if (chosenPolicy?.needsPackage && !(item.weight_oz && dims)) {
    throw new Error(`“${chosenPolicy.name}” uses calculated shipping, so eBay needs the package weight and size (L × W × H).`);
  }

  const inventoryItem = {
    sku,
    title: item.title,
    description,
    aspects,
    condition: conditionFor(item, await client.getConditionIds(categoryId).catch(() => [])),
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
    returnPolicyId: item.return_policy_id || policies.return!,
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
    // Never overwrite another live listing: eBay would quietly turn it into this item if the SKU matches
    const clash = (await client.findOffers(sku)).find((o) => o.status === "PUBLISHED" && o.offerId !== own?.offer_id);
    if (clash) {
      throw new FormError(
        `eBay already has a live listing with the SKU “${sku}”${clash.listingId ? ` (item ${clash.listingId})` : ""}. Posting would replace it, so nothing was sent. Change the Custom SKU in Edit, then try again.`,
        { fix: "edit", detail: `SKU clash with offer ${clash.offerId}` }
      );
    }

    // Photos: eBay copies each from a short-lived signed link
    const paths = (photos ?? []).map((p) => p.jpeg_path ?? p.storage_path);
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (!s.signedUrl) continue;
      try {
        const img = await client.uploadImageFromUrl(s.signedUrl);
        inventoryItem.imageUrls.push(img.imageUrl);
      } catch {
        inventoryItem.imageUrls.push(s.signedUrl);
      }
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
    // The business chose this eBay, so its item moves to Listed either way (sandbox businesses hold test items)
    {
      await supabase
        .from("items")
        .update({ status: "listed", date_listed: today, sku, ebay_item_id: listingId, ebay_offer_id: offerId, ebay_ended_at: null })
        .eq("id", itemId);
      await supabase
        .from("item_events")
        .insert({ item_id: itemId, action: "Published to eBay", note: `${env === "sandbox" ? "Test eBay listing" : "Listing"} ${listingId}` });
    }
    const url = env === "production" ? `https://www.ebay.com/itm/${listingId}` : `https://www.sandbox.ebay.com/itm/${listingId}`;
    return { environment: env, dryRun: false, sku, offerId, listingId, url };
  } catch (e) {
    await recordFailure(e instanceof Error ? e.message : String(e));
    throw ebayProblem(e, "post this item");
  }
}

export type EndResult = { ended: boolean; note: string | null };

type EbayRef =
  | { kind: "app"; listingRowId: string; offerId: string; listingId: string | null; sku: string }
  | { kind: "legacy"; listingId: string }
  | null;

/** Which live eBay listing (if any) belongs to this item: one the app posted, or one made in Seller Hub / the eBay app. */
async function ebayRefFor(supabase: SupabaseClient, itemId: string, env: EbayEnv): Promise<EbayRef> {
  const [{ data: item }, { data: listing }] = await Promise.all([
    supabase.from("items").select("ebay_item_id, ebay_ended_at").eq("id", itemId).single(),
    supabase
      .from("ebay_listings")
      .select("id, offer_id, listing_id, sku")
      .eq("item_id", itemId)
      .eq("environment", env === "mock" ? "sandbox" : env)
      .eq("status", "published")
      .maybeSingle(),
  ]);
  if (listing?.offer_id) return { kind: "app", listingRowId: listing.id, offerId: listing.offer_id, listingId: listing.listing_id, sku: listing.sku };
  if (item?.ebay_item_id && !item.ebay_ended_at) return { kind: "legacy", listingId: item.ebay_item_id };
  return null;
}

/**
 * Takes an item off eBay when it sold elsewhere, went back to inventory, or she gave up on it.
 * Handles listings the app posted (Inventory API) and her older Seller Hub listings (Trading API).
 */
export async function endListing(
  supabase: SupabaseClient,
  itemId: string,
  env: EbayEnv,
  canWrite: boolean,
  actor: string | null,
  ws: string,
  opts: { force?: boolean } = {}
): Promise<EndResult> {
  const ref = await ebayRefFor(supabase, itemId, env);
  if (!ref) return { ended: false, note: null };
  const shownId = ref.listingId;
  if (env === "mock") return { ended: false, note: "Sample data: nothing to end on eBay." };
  if (opts.force) {
    await log(ws, actor, "ebay.end_skipped", { environment: env, itemId, listingId: shownId });
    return { ended: false, note: `Saved in Sale Away only. It's still live on eBay (item ${shownId}): end it there.` };
  }
  if (!canWrite) {
    throw new FormError(
      `This item is still live on eBay (item ${shownId}), and Sale Away isn't allowed to change your eBay listings right now, so nothing was changed.`,
      { fix: "doc", canForce: true, detail: "publishing is off for this business" }
    );
  }
  const client = getEbayClient(env, ws);
  const markEnded = async () => {
    if (ref.kind === "app") await supabase.from("ebay_listings").update({ status: "ended" }).eq("id", ref.listingRowId);
    await supabase.from("items").update({ ebay_ended_at: new Date().toISOString() }).eq("id", itemId);
  };
  try {
    if (ref.kind === "app") await client.withdrawOffer(ref.offerId);
    else await client.endLegacyListing(ref.listingId);
  } catch (e) {
    // Already gone from eBay (ended by FLYP, sold, or ended by hand)? Then there's nothing left to do.
    const stillLive =
      ref.kind === "app"
        ? await client
            .findOffers(ref.sku)
            .then((offers) => offers.some((o) => o.offerId === ref.offerId && o.status === "PUBLISHED"))
            .catch(() => true)
        : true;
    if (stillLive) {
      await log(ws, actor, "ebay.end_failed", { environment: env, itemId, listingId: shownId, error: e instanceof Error ? e.message : String(e) });
      throw ebayProblem(e, "end this eBay listing", { canForce: true });
    }
  }
  await markEnded();
  await log(ws, actor, "ebay.listing_ended", { environment: env, itemId, listingId: shownId, kind: ref.kind });
  return { ended: true, note: `Ended the ${env === "sandbox" ? "test " : ""}eBay listing.` };
}

/**
 * Pushes a new price and/or title to the item's live eBay listing, before Sale Away saves it.
 * Throws (nothing saved) if eBay won't take it, unless she chose to save in Sale Away only.
 */
export async function reviseListing(
  supabase: SupabaseClient,
  itemId: string,
  changes: { price?: number; title?: string },
  env: EbayEnv,
  canWrite: boolean,
  actor: string | null,
  ws: string,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  if (changes.price === undefined && !changes.title) return null;
  const ref = await ebayRefFor(supabase, itemId, env);
  if (!ref || env === "mock") return null;
  const what = [changes.price !== undefined && `price ($${changes.price.toFixed(2)})`, changes.title && "title"].filter(Boolean).join(" and ");
  if (opts.force) {
    await log(ws, actor, "ebay.revise_skipped", { environment: env, itemId, listingId: ref.listingId, ...changes });
    return `Saved in Sale Away only. Change the ${what} on eBay too.`;
  }
  if (!canWrite) {
    throw new FormError(
      `This item is live on eBay (item ${ref.listingId}), and Sale Away isn't allowed to change your eBay listings right now, so the new ${what} wasn't saved.`,
      { fix: "doc", canForce: true, detail: "publishing is off for this business" }
    );
  }
  const client = getEbayClient(env, ws);
  try {
    if (ref.kind === "legacy") {
      await client.reviseLegacyListing(ref.listingId, changes);
    } else {
      if (changes.price !== undefined) await client.updateOfferPrice(ref.offerId, ref.sku, changes.price);
      if (changes.title) await client.updateInventoryTitle(ref.sku, changes.title);
    }
  } catch (e) {
    await log(ws, actor, "ebay.revise_failed", { environment: env, itemId, listingId: ref.listingId, error: e instanceof Error ? e.message : String(e) });
    throw ebayProblem(e, `change the ${what}`, { canForce: true });
  }
  await log(ws, actor, "ebay.listing_revised", { environment: env, itemId, listingId: ref.listingId, ...changes });
  return null;
}
