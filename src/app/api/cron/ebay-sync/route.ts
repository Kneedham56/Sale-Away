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
  const { data: conn } = await createAdminClient().from("ebay_connection").select("environment").eq("environment", env).maybeSingle();
  if (!conn) return NextResponse.json({ skipped: `eBay ${env} not connected` });
  try {
    const result = await runEbaySync(env);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
