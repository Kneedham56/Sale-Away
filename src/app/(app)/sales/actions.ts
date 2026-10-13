"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, isoDate, number, requiredText, text, type ActionResult } from "@/lib/form";

async function db() {
  await requireMember();
  return createClient();
}

const FULFILLMENT = ["to_ship", "packed", "shipped", "delivered", "cancelled", "returned"];

export async function updateSale(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Sale");
    const gross = number(fd, "gross", "Sale price");
    if (gross === null) throw new FormError("Sale price is required.");
    const status = requiredText(fd, "fulfillment_status", "Status");
    if (!FULFILLMENT.includes(status)) throw new FormError("Unknown status.");
    const typedFees = number(fd, "fees", "Fees");
    const before = await supabase.from("sales").select("fees, fee_is_estimate, item_id").eq("id", id).single();
    if (before.error) throw new Error(before.error.message);
    const feesChanged = typedFees !== null && typedFees !== Number(before.data.fees);

    const soldDate = isoDate(fd, "sold_date");
    if (!soldDate) throw new FormError("Date sold is required.");
    const { error } = await supabase
      .from("sales")
      .update({
        platform: requiredText(fd, "platform", "Platform"),
        sold_date: soldDate,
        gross,
        shipping_cost: number(fd, "shipping_cost", "Shipping") ?? 0,
        fees: typedFees ?? 0,
        fee_is_estimate: feesChanged ? false : before.data.fee_is_estimate,
        cogs: number(fd, "cogs", "Cost"),
        adjustments: number(fd, "adjustments", "Adjustments") ?? 0,
        return_charges: number(fd, "return_charges", "Return charges") ?? 0,
        order_id: text(fd, "order_id"),
        buyer_name: text(fd, "buyer_name"),
        ship_by: isoDate(fd, "ship_by"),
        tracking_number: text(fd, "tracking_number"),
        fulfillment_status: status,
        notes: text(fd, "notes"),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (before.data.item_id) {
      await supabase.from("items").update({ date_sold: soldDate }).eq("id", before.data.item_id);
    }
    refresh();
  });
}

export async function setFulfillment(fd: FormData) {
  const supabase = await db();
  const id = requiredText(fd, "id", "Sale");
  const status = requiredText(fd, "status", "Status");
  if (!FULFILLMENT.includes(status)) throw new FormError("Unknown status.");
  await supabase.from("sales").update({ fulfillment_status: status }).eq("id", id);
  const { data } = await supabase.from("sales").select("item_id").eq("id", id).single();
  if (data?.item_id && status === "shipped") await supabase.from("items").update({ status: "shipped" }).eq("id", data.item_id).eq("status", "sold");
  refresh();
}

/** Undo a sale: removes it and puts the item back to Listed. */
export async function deleteSale(fd: FormData) {
  const supabase = await db();
  const id = requiredText(fd, "id", "Sale");
  const { data } = await supabase.from("sales").select("item_id").eq("id", id).single();
  await supabase.from("sales").delete().eq("id", id);
  if (data?.item_id) {
    const { count } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("item_id", data.item_id);
    if (!count) {
      await supabase.from("items").update({ status: "listed", date_sold: null }).eq("id", data.item_id);
      await supabase.from("item_events").insert({ item_id: data.item_id, action: "Sale undone" });
    }
    redirect(`/items/${data.item_id}`);
  }
  redirect("/sold");
}

export async function linkSaleToItem(fd: FormData) {
  const supabase = await db();
  const id = requiredText(fd, "id", "Sale");
  const itemId = text(fd, "item_id");
  const { data: sale } = await supabase.from("sales").select("sold_date, cogs").eq("id", id).single();
  if (itemId) {
    const { data: item } = await supabase.from("items").select("cost").eq("id", itemId).single();
    await supabase
      .from("sales")
      .update({ item_id: itemId, cogs: sale?.cogs ?? item?.cost ?? null })
      .eq("id", id);
    await supabase.from("items").update({ status: "sold", date_sold: sale?.sold_date ?? null }).eq("id", itemId);
  } else {
    await supabase.from("sales").update({ item_id: null }).eq("id", id);
  }
  redirect(`/sales/${id}`);
}
