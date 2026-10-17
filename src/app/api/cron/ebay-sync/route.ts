import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayModeFor } from "@/lib/ebay/mode";
import { runEbaySync } from "@/lib/ebay/sync";

export const maxDuration = 300;

// Called on a schedule (Vercel Cron / GitHub Actions) with "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Every business with a connected eBay account (in the eBay mode that business currently uses)
  const { data: all } = await createAdminClient().from("ebay_connection").select("workspace_id, environment");
  const conns: { workspace_id: string; environment: "sandbox" | "production" }[] = [];
  for (const c of all ?? []) if ((await ebayModeFor(c.workspace_id)).env === c.environment) conns.push(c);
  if (!conns.length) return NextResponse.json({ skipped: "no business has eBay connected" });
  const results: Record<string, unknown> = {};
  let failed = false;
  for (const c of conns) {
    try {
      const r = await runEbaySync(c.environment, c.workspace_id);
      results[c.workspace_id] = { environment: c.environment, orders: r.orders, inserted: r.inserted, updated: r.updated, feesUpdated: r.feesUpdated };
    } catch (e) {
      failed = true;
      results[c.workspace_id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(results, { status: failed ? 500 : 200 });
}
