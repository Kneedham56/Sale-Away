"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, text, type ActionResult } from "@/lib/form";
import { ebayEnv, writeEnabled } from "@/lib/ebay/config";
import { runEbaySync, type SyncResult } from "@/lib/ebay/sync";
import { forgetUserToken } from "@/lib/ebay/tokens";
import { publishItem, type PublishResult } from "@/lib/ebay/publish";

export async function syncNow(): Promise<ActionResult<SyncResult>> {
  return attempt(async () => {
    await requireMember();
    const env = ebayEnv();
    if (env !== "mock") {
      const { data } = await createAdminClient().from("ebay_connection").select("environment").eq("environment", env).maybeSingle();
      if (!data) throw new FormError(`Connect eBay (${env}) first.`);
    }
    const result = await runEbaySync(env);
    refresh();
    return result;
  });
}

export async function disconnectEbay(fd: FormData): Promise<void> {
  const me = await requireMember();
  const env = text(fd, "environment");
  if (env !== "production" && env !== "sandbox") throw new FormError("Unknown environment.");
  const admin = createAdminClient();
  await admin.from("ebay_connection").delete().eq("environment", env);
  forgetUserToken(env);
  await admin.from("activity_log").insert({ actor: me.userId, action: "ebay.disconnected", detail: { environment: env } });
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
      { key: "sku_template", value: text(fd, "sku_template") ?? "{cost}-{lot}-{listed}-{n}" },
    ];
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Publishes one reviewed item. Mock mode returns a preview; sandbox never changes her real item. */
export async function publishToEbay(itemId: string): Promise<ActionResult<PublishResult>> {
  return attempt(async () => {
    const me = await requireMember();
    const env = ebayEnv();
    if (env !== "mock" && !writeEnabled()) throw new FormError("Publishing is switched off (EBAY_WRITE_ENABLED).");
    const supabase = await createClient();
    const result = await publishItem(supabase, itemId, env, me.userId);
    if (!result.dryRun) refresh();
    return result;
  });
}
