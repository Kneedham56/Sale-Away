// One-time setup for a fresh eBay sandbox test seller: opts into business policies, creates a shipping,
// payment and return policy, and saves them (plus a ship-from ZIP) as the business's listing defaults.
//
//   npm run ebay:sandbox-setup -- "Doc's Test Shop" [zip]
//
// Sandbox only: refuses to touch a production connection.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getUserAccessToken } from "../src/lib/ebay/tokens";

config({ path: ".env.local", quiet: true });

const API = "https://api.sandbox.ebay.com";
const MARKETPLACE = "EBAY_US";
const CATEGORY_TYPES = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];

async function main() {
  const [businessName = "Doc's Test Shop", zip = "89084"] = process.argv.slice(2);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data: ws } = await admin.from("workspaces").select("id, name").ilike("name", businessName).single();
  if (!ws) throw new Error(`No business "${businessName}"`);
  const { data: conn } = await admin.from("ebay_connection").select("ebay_username").eq("workspace_id", ws.id).eq("environment", "sandbox").maybeSingle();
  if (!conn) throw new Error(`${ws.name} has no sandbox eBay connection. Connect it in Settings > eBay first.`);
  console.log(`Setting up sandbox seller ${conn.ebay_username} for ${ws.name} ...`);

  const token = await getUserAccessToken("sandbox", ws.id);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-language": "en-US", "x-ebay-c-marketplace-id": MARKETPLACE },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: res.ok, status: res.status, data };
  };

  // 1. Business policies program
  const programs = await call("GET", "/sell/account/v1/program/get_opted_in_programs");
  const optedIn = (programs.data?.programs ?? []).some((p: { programType: string }) => p.programType === "SELLING_POLICY_MANAGEMENT");
  if (!optedIn) {
    const r = await call("POST", "/sell/account/v1/program/opt_in", { programType: "SELLING_POLICY_MANAGEMENT" });
    console.log("  opt in to business policies:", r.ok ? "ok" : `${r.status} ${JSON.stringify(r.data)}`);
  } else console.log("  business policies: already on");

  // 2. Policies (reuse ours if they already exist)
  const find = async (kind: string, name: string) => {
    const r = await call("GET", `/sell/account/v1/${kind}_policy?marketplace_id=${MARKETPLACE}`);
    const list = r.data?.[`${kind}Policies`] ?? [];
    return list.find((p: { name: string }) => p.name === name)?.[`${kind}PolicyId`] as string | undefined;
  };
  const ensure = async (kind: string, name: string, body: object) => {
    const existing = await find(kind, name);
    if (existing) return existing;
    const r = await call("POST", `/sell/account/v1/${kind}_policy`, { name, marketplaceId: MARKETPLACE, categoryTypes: CATEGORY_TYPES, ...body });
    if (!r.ok) throw new Error(`${kind} policy: ${r.status} ${JSON.stringify(r.data?.errors?.[0] ?? r.data)}`);
    return r.data[`${kind}PolicyId`] as string;
  };

  const fulfillment = await ensure("fulfillment", "Sale Away test: USPS, buyer pays", {
    handlingTime: { value: 2, unit: "DAY" },
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType: "FLAT_RATE",
        shippingServices: [{ shippingServiceCode: "USPSPriority", shippingCost: { value: "7.99", currency: "USD" }, sortOrder: 1 }],
      },
    ],
  });
  const payment = await ensure("payment", "Sale Away test: managed payments", { immediatePay: true });
  const returns = await ensure("return", "Sale Away test: 30 days, buyer pays", {
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: "DAY" },
    returnShippingCostPayer: "BUYER",
  });
  console.log("  policies:", { fulfillment, payment, returns });

  // 3. Save as the business's listing defaults
  const { error } = await admin.from("settings").upsert(
    [
      { workspace_id: ws.id, key: "ebay_policies", value: { fulfillment, payment, return: returns } },
      { workspace_id: ws.id, key: "ebay_postal_code", value: zip },
    ],
    { onConflict: "workspace_id,key" }
  );
  if (error) throw new Error(error.message);
  console.log(`  saved as ${ws.name}'s defaults, ship-from ZIP ${zip}. Done.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
