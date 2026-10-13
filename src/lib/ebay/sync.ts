import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_TIME_ZONE } from "@/lib/dates";
import { getEbayClient } from "./client";
import type { EbayEnv } from "./config";
import type { EbayLineItem, EbayOrder, EbayTransaction } from "./types";

type RealEnv = Exclude<EbayEnv, "mock">;

export type SyncResult = {
  environment: EbayEnv;
  dryRun: boolean;
  orders: number;
  lines: number;
  inserted: number;
  updated: number;
  matched: number;
  unmatched: { orderId: string; title: string }[];
  cancelled: number;
  transactions: number;
  feesUpdated: number;
  scrubbed: number;
  preview?: { orderId: string; title: string; gross: number; matchedItem: string | null; status: string }[];
};

const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date(iso));
const n = (m?: { value: string }) => (m ? Number(m.value) : 0);

function fulfillmentFor(order: EbayOrder, line: EbayLineItem): string {
  if (order.cancelStatus?.cancelState === "CANCELED") return "cancelled";
  const s = line.lineItemFulfillmentStatus ?? order.orderFulfillmentStatus;
  return s === "FULFILLED" ? "shipped" : "to_ship";
}

/** Buyer-paid total for one line: item price plus its shipping charge (she buys the label separately). */
export function lineGross(line: EbayLineItem): number {
  return Math.round((n(line.lineItemCost) + n(line.deliveryCost?.shippingCost)) * 100) / 100;
}

/** Item for an order line: SKU first, then eBay item number, then exact title (her VLOOKUP rule). */
async function matchItem(db: SupabaseClient, ws: string, line: EbayLineItem): Promise<{ id: string; cost: number | null; title: string } | null> {
  const pick = "id, cost, title, status";
  if (line.sku) {
    const { data } = await db.from("items").select(pick).eq("workspace_id", ws).eq("sku", line.sku).limit(1);
    if (data?.[0]) return { id: data[0].id, cost: data[0].cost, title: data[0].title };
  }
  if (line.legacyItemId) {
    const { data } = await db.from("items").select(pick).eq("workspace_id", ws).eq("ebay_item_id", line.legacyItemId).limit(1);
    if (data?.[0]) return { id: data[0].id, cost: data[0].cost, title: data[0].title };
    const { data: pub } = await db
      .from("ebay_listings")
      .select("item_id")
      .eq("workspace_id", ws)
      .eq("listing_id", line.legacyItemId)
      .limit(1);
    if (pub?.[0]) {
      const { data: it } = await db.from("items").select(pick).eq("id", pub[0].item_id).single();
      if (it) return { id: it.id, cost: it.cost, title: it.title };
    }
  }
  const { data } = await db.from("items").select(pick).eq("workspace_id", ws).eq("title", line.title.trim()).order("status").limit(5);
  const best = data?.find((i) => i.status === "listed") ?? data?.find((i) => i.status === "ready_to_list") ?? data?.[0];
  return best ? { id: best.id, cost: best.cost, title: best.title } : null;
}

async function feeRate(db: SupabaseClient, ws: string): Promise<number> {
  const { data } = await db.from("platforms").select("fee_rate").eq("workspace_id", ws).eq("code", "ebay").single();
  return Number(data?.fee_rate ?? 0.15);
}

/** Orders for one business's eBay account. Mock mode is always a preview. */
export async function syncOrders(env: EbayEnv, ws: string, opts: { dryRun?: boolean; since?: string } = {}): Promise<SyncResult> {
  const dryRun = env === "mock" || !!opts.dryRun;
  const db = createAdminClient();
  const client = getEbayClient(env, ws);
  const result: SyncResult = {
    environment: env, dryRun, orders: 0, lines: 0, inserted: 0, updated: 0, matched: 0, unmatched: [], cancelled: 0,
    transactions: 0, feesUpdated: 0, scrubbed: 0, preview: dryRun ? [] : undefined,
  };

  let since = opts.since;
  if (!since) {
    const { data: state } = env === "mock" ? { data: null } : await db.from("ebay_sync_state").select("orders_synced_at").eq("workspace_id", ws).eq("environment", env).maybeSingle();
    const last = state?.orders_synced_at ? new Date(state.orders_synced_at) : new Date(Date.now() - 30 * 86400_000);
    since = new Date(last.getTime() - 3600_000).toISOString(); // 1h overlap
  }
  const startedAt = new Date().toISOString();
  const orders = await client.getOrders(since);
  const rate = await feeRate(db, ws);
  result.orders = orders.length;

  for (const order of orders) {
    for (const line of order.lineItems) {
      result.lines++;
      const item = await matchItem(db, ws, line);
      const status = fulfillmentFor(order, line);
      const gross = lineGross(line);
      if (status === "cancelled") result.cancelled++;
      if (item) result.matched++;
      else result.unmatched.push({ orderId: order.orderId, title: line.title });

      if (dryRun) {
        result.preview!.push({ orderId: order.orderId, title: line.title, gross, matchedItem: item?.title ?? null, status });
        continue;
      }
      const environment = env as RealEnv;
      const ship = order.fulfillmentStartInstructions?.[0]?.shippingStep;
      const ebayFields = {
        workspace_id: ws,
        environment,
        platform: "ebay",
        order_id: order.orderId,
        line_item_id: line.lineItemId,
        title_snapshot: line.title,
        sold_date: localDate(order.creationDate),
        quantity: line.quantity,
        gross,
        buyer_username: order.buyer?.username ?? null,
        buyer_name: ship?.shipTo?.fullName ?? null,
        ship_to: ship?.shipTo?.contactAddress ? { name: ship.shipTo.fullName, ...ship.shipTo.contactAddress } : null,
        ship_by: line.lineItemFulfillmentInstructions?.shipByDate ? localDate(line.lineItemFulfillmentInstructions.shipByDate) : null,
        shipping_service: ship?.shippingServiceCode ?? null,
        ebay_last_modified: order.lastModifiedDate,
      };

      const { data: existing } = await db
        .from("sales")
        .select("id, fulfillment_status, item_id")
        .eq("workspace_id", ws)
        .eq("platform", "ebay")
        .eq("order_id", order.orderId)
        .eq("line_item_id", line.lineItemId)
        .maybeSingle();

      if (existing) {
        // eBay owns status and shipping details; her edits to money fields stay
        const keepLocal = ["packed"].includes(existing.fulfillment_status) && status === "to_ship";
        await db
          .from("sales")
          .update({ ...ebayFields, fulfillment_status: keepLocal ? existing.fulfillment_status : status, item_id: existing.item_id ?? item?.id ?? null })
          .eq("id", existing.id);
        result.updated++;
      } else {
        // She may have marked this sale by hand already: attach the order instead of adding a twin
        const manual = item
          ? (
              await db
                .from("sales")
                .select("id")
                .eq("workspace_id", ws)
                .eq("item_id", item.id)
                .eq("platform", "ebay")
                .is("order_id", null)
                .eq("environment", environment)
                .limit(1)
            ).data?.[0]
          : null;
        if (manual) {
          await db.from("sales").update({ ...ebayFields, fulfillment_status: status }).eq("id", manual.id);
          result.updated++;
        } else {
          const { error } = await db.from("sales").insert({
            ...ebayFields,
            item_id: item?.id ?? null,
            cogs: item?.cost ?? null,
            fees: Math.round(gross * rate * 100) / 100,
            fee_rate: rate,
            fee_is_estimate: true,
            fulfillment_status: status,
          });
          if (error) throw new Error(error.message);
          result.inserted++;
        }
      }

      // Only production orders move her real items
      if (item && environment === "production") {
        const itemStatus = status === "cancelled" ? null : status === "shipped" ? "shipped" : "sold";
        if (itemStatus) {
          await db.from("items").update({ status: itemStatus, date_sold: localDate(order.creationDate) }).eq("id", item.id).in("status", ["listed", "ready_to_list", "unlisted", "sold"]);
        } else {
          // Cancelled: put it back on the shelf if this order had marked it sold
          await db.from("items").update({ status: "listed", date_sold: null }).eq("id", item.id).eq("status", "sold");
        }
      }
    }
  }

  if (!dryRun) {
    await db
      .from("ebay_sync_state")
      .upsert({ workspace_id: ws, environment: env, orders_synced_at: startedAt }, { onConflict: "workspace_id,environment" });
  }
  return result;
}

function orderIdOf(t: EbayTransaction): string | null {
  return t.orderId ?? t.references?.find((r) => r.referenceType === "ORDER_ID")?.referenceId ?? null;
}

/** Pulls finance transactions and replaces estimated fees with eBay's actual fees, label costs and refunds. */
export async function syncFinances(env: RealEnv, ws: string, opts: { since?: string } = {}): Promise<{ transactions: number; feesUpdated: number }> {
  const db = createAdminClient();
  const client = getEbayClient(env, ws);
  let since = opts.since;
  if (!since) {
    const { data: state } = await db.from("ebay_sync_state").select("finances_synced_at").eq("workspace_id", ws).eq("environment", env).maybeSingle();
    const last = state?.finances_synced_at ? new Date(state.finances_synced_at) : new Date(Date.now() - 90 * 86400_000);
    since = new Date(last.getTime() - 2 * 86400_000).toISOString(); // finance records settle late
  }
  const startedAt = new Date().toISOString();
  const txns = await client.getTransactions(since);

  const rows = txns.flatMap((t) => {
    const orderId = orderIdOf(t);
    const lines = t.orderLineItems?.length ? t.orderLineItems : [null];
    return lines.map((l, i) => ({
      workspace_id: ws,
      transaction_id: lines.length > 1 ? `${t.transactionId}#${l?.lineItemId ?? i}` : t.transactionId,
      environment: env,
      order_id: orderId,
      line_item_id: l?.lineItemId ?? null,
      transaction_type: t.transactionType,
      booking_entry: t.bookingEntry,
      amount: i === 0 ? Number(t.amount.value) : 0,
      fee_amount: l?.marketplaceFees
        ? l.marketplaceFees.reduce((s, f) => s + Number(f.amount.value), 0)
        : i === 0 && t.totalFeeAmount
          ? Number(t.totalFeeAmount.value)
          : null,
      transaction_date: t.transactionDate,
      raw: t,
    }));
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("ebay_transactions").upsert(rows.slice(i, i + 500), { onConflict: "workspace_id,environment,transaction_id" });
    if (error) throw new Error(error.message);
  }

  // Recompute every eBay sale in this environment that still has an estimate, plus orders touched now
  const touched = new Set(rows.map((r) => r.order_id).filter(Boolean) as string[]);
  const { data: estimated } = await db
    .from("sales")
    .select("order_id")
    .eq("workspace_id", ws)
    .eq("environment", env)
    .eq("platform", "ebay")
    .eq("fee_is_estimate", true)
    .not("order_id", "is", null);
  for (const s of estimated ?? []) touched.add(s.order_id);

  let feesUpdated = 0;
  for (const orderId of touched) {
    const [{ data: tx }, { data: sales }] = await Promise.all([
      db.from("ebay_transactions").select("*").eq("workspace_id", ws).eq("environment", env).eq("order_id", orderId),
      db.from("sales").select("id, line_item_id").eq("workspace_id", ws).eq("environment", env).eq("platform", "ebay").eq("order_id", orderId).order("line_item_id"),
    ]);
    if (!tx?.length || !sales?.length) continue;
    const saleTx = tx.filter((t) => t.transaction_type === "SALE");
    const sum = (list: typeof tx) => Math.round(list.reduce((s, t) => s + Number(t.amount), 0) * 100) / 100;
    const labels = sum(tx.filter((t) => t.transaction_type === "SHIPPING_LABEL" && t.booking_entry === "DEBIT"));
    const refunds = sum(tx.filter((t) => t.transaction_type === "REFUND" && t.booking_entry === "DEBIT"));
    const orderFee = saleTx.filter((t) => !t.line_item_id).reduce((s, t) => s + Number(t.fee_amount ?? 0), 0);

    for (const [idx, sale] of sales.entries()) {
      const lineFee = saleTx.filter((t) => t.line_item_id === sale.line_item_id).reduce((s, t) => s + Number(t.fee_amount ?? 0), 0);
      const fees = Math.round((lineFee || orderFee / sales.length) * 100) / 100;
      const patch: Record<string, unknown> = {};
      if (saleTx.length) Object.assign(patch, { fees, fee_is_estimate: false, fee_rate: null });
      // Order-level costs go on the first line so they're counted once
      if (idx === 0 && labels) patch.shipping_cost = labels;
      if (idx === 0 && refunds) patch.return_charges = refunds;
      if (Object.keys(patch).length) {
        await db.from("sales").update(patch).eq("id", sale.id);
        feesUpdated++;
      }
    }
  }
  await db
    .from("ebay_sync_state")
    .upsert({ workspace_id: ws, environment: env, finances_synced_at: startedAt }, { onConflict: "workspace_id,environment" });
  return { transactions: txns.length, feesUpdated };
}

/** Buyer names and addresses are kept only until 30 days after shipping. */
export async function scrubShippedBuyerDetails(): Promise<number> {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { count } = await db
    .from("sales")
    .update({ ship_to: null, buyer_name: null }, { count: "exact" })
    .in("fulfillment_status", ["shipped", "delivered", "cancelled", "returned"])
    .lt("sold_date", cutoff)
    .not("ship_to", "is", null);
  return count ?? 0;
}

/** Everything the scheduled job does, recorded in ebay_sync_state. */
export async function runEbaySync(env: EbayEnv, ws: string): Promise<SyncResult> {
  const db = createAdminClient();
  try {
    const result = await syncOrders(env, ws);
    if (env !== "mock") {
      const fin = await syncFinances(env, ws);
      result.transactions = fin.transactions;
      result.feesUpdated = fin.feesUpdated;
      result.scrubbed = await scrubShippedBuyerDetails();
      const summary = { ...result, preview: undefined };
      await db
        .from("ebay_sync_state")
        .upsert(
          { workspace_id: ws, environment: env, last_run_at: new Date().toISOString(), last_error: null, last_result: summary },
          { onConflict: "workspace_id,environment" }
        );
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (env !== "mock") {
      await db
        .from("ebay_sync_state")
        .upsert(
          { workspace_id: ws, environment: env, last_run_at: new Date().toISOString(), last_error: message },
          { onConflict: "workspace_id,environment" }
        );
    }
    throw e;
  }
}
