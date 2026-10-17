import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayEnv, hasCredentials, writeEnabled, type EbayEnv } from "./config";

export type EbayMode = {
  /** Which eBay this business talks to */
  env: EbayEnv;
  /** Whether publishing listings is allowed right now (mock = preview only) */
  canPublish: boolean;
  /** Why publishing is off, in plain words */
  publishOffReason: string | null;
  /** The business's own "publishing on" switch (production only) */
  publishingSwitch: boolean;
};

/**
 * Each business picks its own eBay: e.g. Doc's Test Shop uses eBay's sandbox (fake listings, test buyers)
 * while Mommatom's uses her real account. Settings: "ebay_environment" and "ebay_publishing".
 * Real-eBay publishing needs BOTH the business switch and the server-wide EBAY_WRITE_ENABLED master switch.
 */
export async function ebayModeFor(workspaceId: string): Promise<EbayMode> {
  const { data } = await createAdminClient()
    .from("settings")
    .select("key, value")
    .eq("workspace_id", workspaceId)
    .in("key", ["ebay_environment", "ebay_publishing"]);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const chosen = s.ebay_environment;
  const env: EbayEnv = chosen === "mock" || chosen === "sandbox" || chosen === "production" ? chosen : ebayEnv();
  const publishingSwitch = s.ebay_publishing === true;

  if (env === "mock") return { env, canPublish: true, publishOffReason: null, publishingSwitch };
  if (env === "sandbox") {
    return hasCredentials("sandbox")
      ? { env, canPublish: true, publishOffReason: null, publishingSwitch }
      : { env, canPublish: false, publishOffReason: "eBay sandbox keys aren't set on the server yet.", publishingSwitch };
  }
  if (!writeEnabled()) {
    return { env, canPublish: false, publishOffReason: "Publishing to real eBay is switched off on the server.", publishingSwitch };
  }
  if (!publishingSwitch) {
    return { env, canPublish: false, publishOffReason: "Publishing is off for this business (Settings → eBay).", publishingSwitch };
  }
  return { env, canPublish: true, publishOffReason: null, publishingSwitch };
}
