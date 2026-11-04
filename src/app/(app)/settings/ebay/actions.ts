"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, text, type ActionResult } from "@/lib/form";
import { ebayModeFor } from "@/lib/ebay/mode";
import { runEbaySync, type SyncResult } from "@/lib/ebay/sync";
import { forgetUserToken } from "@/lib/ebay/tokens";
import { publishItem, type PublishResult } from "@/lib/ebay/publish";
import { ebayProblem } from "@/lib/ebay/errors";
import { DEFAULT_SKU_TEMPLATE } from "@/lib/sku";
import { cleanMeasurements, type Measurement } from "@/lib/measurements";

export async function syncNow(): Promise<ActionResult<SyncResult>> {
  return attempt(async () => {
    const me = await requireMember();
    const { env } = await ebayModeFor(me.workspace.id);
    if (env !== "mock") {
      const { data } = await createAdminClient()
        .from("ebay_connection")
        .select("environment")
        .eq("workspace_id", me.workspace.id)
        .eq("environment", env)
        .maybeSingle();
      if (!data) throw new FormError(`Connect eBay (${env}) first.`);
    }
    const result = await runEbaySync(env, me.workspace.id);
    refresh();
    return result;
  });
}

export async function disconnectEbay(fd: FormData): Promise<void> {
  const me = await requireMember();
  const env = text(fd, "environment");
  if (env !== "production" && env !== "sandbox") throw new FormError("Unknown environment.");
  const admin = createAdminClient();
  await admin.from("ebay_connection").delete().eq("workspace_id", me.workspace.id).eq("environment", env);
  forgetUserToken(env, me.workspace.id);
  await admin
    .from("activity_log")
    .insert({ workspace_id: me.workspace.id, actor: me.userId, action: "ebay.disconnected", detail: { environment: env } });
  refresh();
}

export async function saveEbaySettings(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    await requireMember();
    const supabase = await createClient();
    const zip = text(fd, "ebay_postal_code") ?? "";
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) throw new FormError("ZIP code looks wrong.");
    const rows = [
      {
        key: "ebay_policies",
        value: {
          fulfillment: text(fd, "fulfillment") ?? undefined,
          fulfillment_media: text(fd, "fulfillment_media") ?? undefined,
          payment: text(fd, "payment") ?? undefined,
          return: text(fd, "return") ?? undefined,
        },
      },
      { key: "ebay_postal_code", value: zip },
      { key: "sku_template", value: text(fd, "sku_template") ?? DEFAULT_SKU_TEMPLATE },
    ];
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "workspace_id,key" });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Next time an item of the same Sale Away category is posted, her store category is pre-picked. */
async function rememberStoreCategory(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string, path: string | null) {
  const { data: item } = await supabase.from("items").select("category").eq("id", itemId).single();
  if (!item?.category || !path) return;
  const { data: row } = await supabase.from("settings").select("value").eq("key", "store_category_map").maybeSingle();
  const map = { ...((row?.value as Record<string, string>) ?? {}), [item.category.toLowerCase()]: path };
  await supabase.from("settings").upsert({ key: "store_category_map", value: map }, { onConflict: "workspace_id,key" });
}

/** Publishes one reviewed item. Mock mode returns a preview; sandbox never changes her real item. */
export type ListingChoices = {
  shippingPolicyId?: string | null;
  returnPolicyId?: string | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  measurements?: Measurement[];
  /** Store category path ("Holiday/Christmas"); null = Other */
  storeCategory?: string | null;
  /** Required item specifics she filled in the box (added to / replacing the listing's) */
  specifics?: { name: string; value: string }[];
};

export async function publishToEbay(itemId: string, price?: number | null, choices?: ListingChoices): Promise<ActionResult<PublishResult>> {
  return attempt(async () => {
    const me = await requireMember();
    const mode = await ebayModeFor(me.workspace.id);
    if (!mode.canPublish) throw new FormError(mode.publishOffReason ?? "Publishing is off.", { fix: "doc" });
    const env = mode.env;
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (price !== undefined && price !== null) {
      if (!(price > 0)) throw new FormError("Enter a price above $0.");
      patch.list_price = Math.round(price * 100) / 100;
    }
    if (choices) {
      if (choices.shippingPolicyId !== undefined) patch.shipping_policy_id = choices.shippingPolicyId || null;
      if (choices.returnPolicyId !== undefined) patch.return_policy_id = choices.returnPolicyId || null;
      const num = (n: number | null | undefined) => (n === undefined ? undefined : n && n > 0 ? Math.round(n * 100) / 100 : null);
      for (const [key, v] of [["weight_oz", choices.weightOz], ["length_in", choices.lengthIn], ["width_in", choices.widthIn], ["height_in", choices.heightIn]] as const) {
        const n = num(v);
        if (n !== undefined) patch[key] = n;
      }
    }
    if (choices?.measurements) {
      const list = cleanMeasurements(choices.measurements);
      patch.measurements = list.length ? list : null;
    }
    if (choices?.specifics?.length) {
      const { data: cur } = await supabase.from("items").select("item_specifics").eq("id", itemId).single();
      const added = choices.specifics.map((s) => ({ name: s.name.slice(0, 65), value: s.value.slice(0, 65) }));
      const names = new Set(added.map((s) => s.name.toLowerCase()));
      patch.item_specifics = [...((cur?.item_specifics ?? []) as { name: string; value: string }[]).filter((s) => !names.has(s.name.toLowerCase())), ...added];
    }
    if (choices?.storeCategory !== undefined) {
      patch.ebay_store_category = choices.storeCategory || null;
      await rememberStoreCategory(supabase, itemId, choices.storeCategory || null);
    }
    if (Object.keys(patch).length) await supabase.from("items").update(patch).eq("id", itemId);
    const result = await publishItem(supabase, itemId, env, me.userId, me.workspace.id).catch((e: unknown) => {
      throw ebayProblem(e, "post this item");
    });
    if (!result.dryRun) refresh();
    return result;
  });
}

/** Doc only: which eBay this business uses, and whether it may publish (real eBay also needs the server switch). */
export async function setEbayMode(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const me = await requireMember();
    if (me.role !== "admin") throw new FormError("Only the admin can change this.");
    const env = text(fd, "ebay_environment");
    if (env !== "mock" && env !== "sandbox" && env !== "production") throw new FormError("Unknown eBay mode.");
    const publishing = fd.get("ebay_publishing") === "on";
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert(
      [
        { key: "ebay_environment", value: env },
        { key: "ebay_publishing", value: publishing },
      ],
      { onConflict: "workspace_id,key" }
    );
    if (error) throw new Error(error.message);
    await createAdminClient()
      .from("activity_log")
      .insert({ workspace_id: me.workspace.id, actor: me.userId, action: "ebay.mode_changed", detail: { environment: env, publishing } });
    refresh();
  });
}
