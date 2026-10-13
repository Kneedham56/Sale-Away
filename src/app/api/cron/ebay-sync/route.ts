import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayEnv } from "@/lib/ebay/config";
import { runEbaySync } from "@/lib/ebay/sync";

export const maxDuration = 300;

// Called on a schedule (Vercel Cron / GitHub Actions) with "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const env = ebayEnv();
  if (env === "mock") return NextResponse.json({ skipped: "EBAY_ENV is mock" });
  // Every business with a connected eBay account, one after another
  const { data: conns } = await createAdminClient().from("ebay_connection").select("workspace_id").eq("environment", env);
  if (!conns?.length) return NextResponse.json({ skipped: `no business has eBay ${env} connected` });
  const results: Record<string, unknown> = {};
  let failed = false;
  for (const c of conns) {
    try {
      const r = await runEbaySync(env, c.workspace_id);
      results[c.workspace_id] = { orders: r.orders, inserted: r.inserted, updated: r.updated, feesUpdated: r.feesUpdated };
    } catch (e) {
      failed = true;
      results[c.workspace_id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(results, { status: failed ? 500 : 200 });
}
