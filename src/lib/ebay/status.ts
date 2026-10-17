import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EbayEnv } from "./config";
import { ebayModeFor } from "./mode";
import { runEbaySync } from "./sync";

const STALE_MS = 15 * 60_000;

export type EbayStatus = {
  env: EbayEnv;
  connected: boolean;
  username: string | null;
  expiresSoon: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

/**
 * Connection health for banners. Also starts a background sync after the page is sent when the last one is
 * over 15 minutes old, so orders arrive whenever she opens the app (Vercel's free plan only allows daily cron).
 */
export async function ebayStatusAndAutoSync(ws: string): Promise<EbayStatus> {
  const { env } = await ebayModeFor(ws);
  if (env === "mock") return { env, connected: false, username: null, expiresSoon: false, lastRunAt: null, lastError: null };
  const admin = createAdminClient();
  const [{ data: conn }, { data: state }] = await Promise.all([
    admin.from("ebay_connection").select("ebay_username, refresh_token_expires_at").eq("workspace_id", ws).eq("environment", env).maybeSingle(),
    admin.from("ebay_sync_state").select("last_run_at, last_error").eq("workspace_id", ws).eq("environment", env).maybeSingle(),
  ]);
  if (conn && (!state?.last_run_at || Date.now() - new Date(state.last_run_at).getTime() > STALE_MS)) {
    after(async () => {
      try {
        await runEbaySync(env, ws);
      } catch (e) {
        console.error("Background eBay sync failed", e);
      }
    });
  }
  return {
    env,
    connected: !!conn,
    username: conn?.ebay_username ?? null,
    expiresSoon: !!conn?.refresh_token_expires_at && new Date(conn.refresh_token_expires_at).getTime() - Date.now() < 30 * 86400_000,
    lastRunAt: state?.last_run_at ?? null,
    lastError: state?.last_error ?? null,
  };
}
