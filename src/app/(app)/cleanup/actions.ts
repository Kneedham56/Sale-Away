"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { FormError, number, requiredText, text } from "@/lib/form";

// Temporary: one-time cleanup after connecting eBay. Every choice is applied right away and logged on the
// item's history ("Cleanup: ...") so Doc can review it afterwards.

async function db() {
  await requireMember();
  return createClient();
}

async function note(supabase: Awaited<ReturnType<typeof createClient>>, itemId: string, what: string) {
  await supabase.from("item_events").insert({ item_id: itemId, action: "Cleanup", note: what });
}

/** An item the app thought was listed, but it isn't live on eBay. */
export async function resolveAppItem(fd: FormData): Promise<void> {
  const supabase = await db();
  const id = requiredText(fd, "id", "Item");
  const choice = requiredText(fd, "choice", "Choice");
  const today = await todayIso();
  if (choice === "sold") {
    await supabase.from("items").update({ status: "shipped" }).eq("id", id);
    await note(supabase, id, "Sold before the app (already in her records)");
  } else if (choice === "still_have") {
    await supabase.from("items").update({ status: "unlisted" }).eq("id", id);
    await note(supabase, id, "Not listed; still has it (back to Inventory)");
  } else if (choice === "gone") {
    await supabase.from("items").update({ status: "discarded", date_exited: today }).eq("id", id);
    await note(supabase, id, "Gone (donated / thrown away)");
  } else if (choice.startsWith("same:")) {
    const listingId = choice.slice(5);
    await supabase.from("items").update({ ebay_item_id: listingId, status: "listed", ebay_ended_at: null }).eq("id", id);
    await supabase.from("ebay_active_listings").update({ item_id: id }).eq("listing_id", listingId);
    await note(supabase, id, `Same as eBay listing ${listingId} (title changed on eBay)`);
  } else {
    throw new FormError("Unknown choice.");
  }
  refresh();
}

/** A live eBay listing with no matching item in the app. */
export async function resolveLiveListing(fd: FormData): Promise<void> {
  const supabase = await db();
  const listingId = requiredText(fd, "listing_id", "Listing");
  const choice = requiredText(fd, "choice", "Choice");
  const { data: l } = await supabase.from("ebay_active_listings").select("*").eq("listing_id", listingId).single();
  if (!l) throw new FormError("That listing isn't in the list any more.");

  if (choice === "add") {
    const { data: item, error } = await supabase
      .from("items")
      .insert({
        title: l.title,
        status: "listed",
        list_price: l.price,
        date_listed: l.start_time ? String(l.start_time).slice(0, 10) : await todayIso(),
        ebay_item_id: listingId,
        sku: l.sku,
        cost: number(fd, "cost", "Cost"),
        storage_location: text(fd, "storage_location"),
      })
      .select("id")
      .single();
    if (error || !item) throw new Error(error?.message ?? "Couldn't add it.");
    await supabase.from("ebay_active_listings").update({ item_id: item.id }).eq("listing_id", listingId);
    await note(supabase, item.id, `Added from eBay listing ${listingId}`);
  } else if (choice.startsWith("same:")) {
    const itemId = choice.slice(5);
    await supabase.from("items").update({ ebay_item_id: listingId, status: "listed", ebay_ended_at: null }).eq("id", itemId);
    await supabase.from("ebay_active_listings").update({ item_id: itemId }).eq("listing_id", listingId);
    await note(supabase, itemId, `Same as eBay listing ${listingId} (title changed on eBay)`);
  } else if (choice === "skip") {
    const { data: s } = await supabase.from("settings").select("value").eq("key", "cleanup_skipped").maybeSingle();
    const skipped = new Set(Array.isArray(s?.value) ? (s!.value as string[]) : []);
    skipped.add(listingId);
    await supabase.from("settings").upsert({ key: "cleanup_skipped", value: [...skipped] }, { onConflict: "workspace_id,key" });
  } else {
    throw new FormError("Unknown choice.");
  }
  refresh();
}
