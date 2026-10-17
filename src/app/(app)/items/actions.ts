"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { createSource } from "@/lib/data/sources";
import { todayIso } from "@/lib/dates";
import { PHOTO_BUCKET } from "@/lib/photos";
import { attempt, bool, FormError, isoDate, number, requiredText, text, type ActionResult } from "@/lib/form";
import type { ItemStatus } from "@/lib/format";
import { endListing } from "@/lib/ebay/publish";
import { ebayModeFor } from "@/lib/ebay/mode";

export type NewPhoto = { storage_path: string; jpeg_path: string | null; thumb_path: string | null };
type Db = Awaited<ReturnType<typeof createClient>>;

async function db() {
  await requireMember();
  return createClient();
}

function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
}

/** Remembers new categories and storage spots so they show up in the pick lists. */
async function rememberLookups(supabase: Db, category: string | null, location: string | null) {
  if (category)
    await supabase.from("categories").upsert({ name: category, sort_order: 999 }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
  if (location)
    await supabase
      .from("storage_locations")
      .upsert({ name: location, kind: /^\d+$/.test(location) ? "bin" : "place" }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
}

/** Trip picked from the list, or a new one described inline ("new"). */
async function resolveSource(supabase: Db, fd: FormData): Promise<string | null> {
  const sourceId = text(fd, "source_id");
  if (sourceId !== "new") return sourceId;
  const created = await createSource(supabase, {
    type: requiredText(fd, "new_trip_type", "Trip type"),
    place: text(fd, "new_trip_place"),
    date: isoDate(fd, "new_trip_date") ?? (await todayIso()),
    total_spent: number(fd, "new_trip_total", "Total spent"),
  });
  return created.id;
}

function itemFields(fd: FormData) {
  const kind = text(fd, "kind") ?? "general";
  if (!["general", "book", "media"].includes(kind)) throw new FormError("Unknown kind.");
  const condition = text(fd, "condition");
  const grade = text(fd, "condition_grade");
  return {
    title: requiredText(fd, "title", "Title"),
    kind,
    category: text(fd, "category"),
    format: kind === "media" ? text(fd, "format") : null,
    is_bundle: bool(fd, "is_bundle"),
    cost: number(fd, "cost", "Cost"),
    storage_location: text(fd, "storage_location"),
    condition: condition === "new" || condition === "pre_owned" ? condition : null,
    condition_grade: grade && ["excellent", "good", "acceptable"].includes(grade) ? grade : null,
    condition_notes: text(fd, "condition_notes"),
    list_price: number(fd, "list_price", "List price"),
    notes: text(fd, "notes"),
  };
}

export async function createItem(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult<{ id: string; sourceId: string | null }>> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Item id");
    const fields = itemFields(fd);
    const source_id = await resolveSource(supabase, fd);
    const today = await todayIso();
    let date_sourced = today;
    if (source_id) {
      const { data } = await supabase.from("sources").select("date").eq("id", source_id).single();
      date_sourced = data?.date ?? today;
    }
    const photos: NewPhoto[] = JSON.parse(text(fd, "photos") ?? "[]");

    // Upsert on the client-made id, so a save retried after lost signal can't create a duplicate
    must(await supabase.from("items").upsert({ id, ...fields, source_id, date_sourced, status: "unlisted" }));
    if (photos.length) {
      await supabase.from("item_photos").delete().eq("item_id", id);
      must(await supabase.from("item_photos").insert(photos.map((p, i) => ({ item_id: id, ...p, sort_order: i }))));
    }
    await rememberLookups(supabase, fields.category, fields.storage_location);
    refresh();
    return { id, sourceId: source_id };
  });
}

export async function updateItem(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Item id");
    const fields = itemFields(fd);
    const source_id = await resolveSource(supabase, fd);
    const before = must(await supabase.from("items").select("list_price").eq("id", id).single());
    must(
      await supabase
        .from("items")
        .update({
          ...fields,
          source_id,
          date_sourced: isoDate(fd, "date_sourced"),
          date_listed: isoDate(fd, "date_listed"),
          weight_oz: number(fd, "weight_oz", "Weight"),
          length_in: number(fd, "length_in", "Length"),
          width_in: number(fd, "width_in", "Width"),
          height_in: number(fd, "height_in", "Height"),
          sku: text(fd, "sku"),
          ebay_item_id: text(fd, "ebay_item_id"),
        })
        .eq("id", id)
    );
    const oldPrice = before.list_price === null ? null : Number(before.list_price);
    if (oldPrice !== null && fields.list_price !== null && oldPrice !== fields.list_price) {
      await supabase.from("item_events").insert({
        item_id: id,
        action: fields.list_price < oldPrice ? "Reduced Price" : "Revised Listing",
        old_value: String(oldPrice),
        new_value: String(fields.list_price),
      });
    }
    await rememberLookups(supabase, fields.category, fields.storage_location);
    refresh();
  });
}

const EXIT_STATUSES: ItemStatus[] = ["donated", "damaged", "kept", "discarded"];

/** When an item leaves Listed without selling on eBay, take it off eBay too (or say how). */
async function takeOffEbay(supabase: Db, itemId: string): Promise<string | null> {
  const me = await requireMember();
  const mode = await ebayModeFor(me.workspace.id);
  const r = await endListing(supabase, itemId, mode.env, mode.canPublish, me.userId, me.workspace.id);
  return r.note;
}
const ACTIVE_STATUSES: ItemStatus[] = ["intake", "unlisted", "ready_to_list", "listed"];

/** Returns a note when something on eBay needs her attention (e.g. a Seller Hub listing to end by hand). */
export async function changeStatus(_prev: unknown, fd: FormData): Promise<ActionResult<string | null>> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Item id");
    const status = requiredText(fd, "status", "Status") as ItemStatus;
    const today = await todayIso();
    const before = must(await supabase.from("items").select("status, title, cost, date_listed").eq("id", id).single());

    const patch: Record<string, unknown> = { status };
    if (status === "listed") {
      patch.date_listed = isoDate(fd, "date_listed") ?? before.date_listed ?? today;
      const price = number(fd, "list_price", "List price");
      if (price !== null) patch.list_price = price;
      const loc = text(fd, "storage_location");
      if (loc) patch.storage_location = loc;
      await rememberLookups(supabase, null, loc);
    }
    if (EXIT_STATUSES.includes(status)) patch.date_exited = today;
    if (ACTIVE_STATUSES.includes(status)) {
      patch.date_exited = null;
      patch.date_sold = null;
    }
    must(await supabase.from("items").update(patch).eq("id", id));

    if (status === "damaged") {
      await supabase.from("write_offs").insert({
        item_id: id,
        title_snapshot: before.title,
        date: today,
        value: before.cost ?? 0,
        reason: text(fd, "note"),
      });
    }
    await supabase.from("item_events").insert({
      item_id: id,
      action: "Status Changed",
      old_value: before.status,
      new_value: status,
      note: text(fd, "note"),
    });
    const note = EXIT_STATUSES.includes(status) && before.status === "listed" ? await takeOffEbay(supabase, id) : null;
    refresh();
    return note;
  });
}

export async function logItemEvent(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Item id");
    const action = requiredText(fd, "action", "Action");
    const newPrice = number(fd, "new_price", "New price");
    let old_value: string | null = null;
    if (newPrice !== null) {
      const before = must(await supabase.from("items").select("list_price").eq("id", id).single());
      old_value = before.list_price === null ? null : String(before.list_price);
      must(await supabase.from("items").update({ list_price: newPrice }).eq("id", id));
    }
    if (/^relist/i.test(action)) {
      must(await supabase.from("items").update({ date_listed: await todayIso() }).eq("id", id));
    }
    if (/^removed/i.test(action)) {
      must(await supabase.from("items").update({ status: "unlisted" }).eq("id", id));
    }
    must(
      await supabase.from("item_events").insert({
        item_id: id,
        action,
        note: text(fd, "note"),
        old_value,
        new_value: newPrice === null ? null : String(newPrice),
      })
    );
    refresh();
  });
}

export async function addPhotos(itemId: string, photos: NewPhoto[]): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const { data: last } = await supabase
      .from("item_photos")
      .select("sort_order")
      .eq("item_id", itemId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const start = (last?.[0]?.sort_order ?? -1) + 1;
    must(
      await supabase.from("item_photos").insert(photos.map((p, i) => ({ item_id: itemId, ...p, sort_order: start + i })))
    );
    await supabase.from("item_events").insert({ item_id: itemId, action: "Changed Photos", note: `Added ${photos.length}` });
    refresh();
  });
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const photo = must(await supabase.from("item_photos").select("*").eq("id", photoId).single());
    must(await supabase.from("item_photos").delete().eq("id", photoId));
    const paths = [photo.storage_path, photo.jpeg_path, photo.thumb_path].filter(Boolean) as string[];
    await supabase.storage.from(PHOTO_BUCKET).remove([...new Set(paths)]);
    refresh();
  });
}

/** Moves a photo to the front (cover) or one step left/right. */
export async function movePhoto(photoId: string, to: "first" | "left" | "right"): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const photo = must(await supabase.from("item_photos").select("item_id").eq("id", photoId).single());
    const ids = must(
      await supabase.from("item_photos").select("id").eq("item_id", photo.item_id).order("sort_order").order("created_at")
    ).map((p) => p.id);
    const i = ids.indexOf(photoId);
    const j = to === "first" ? 0 : to === "left" ? Math.max(0, i - 1) : Math.min(ids.length - 1, i + 1);
    ids.splice(i, 1);
    ids.splice(j, 0, photoId);
    await Promise.all(ids.map((id, n) => supabase.from("item_photos").update({ sort_order: n }).eq("id", id)));
    refresh();
  });
}

export async function deleteItem(fd: FormData) {
  const supabase = await db();
  const id = requiredText(fd, "id", "Item id");
  const { data: photos } = await supabase.from("item_photos").select("storage_path, jpeg_path, thumb_path").eq("item_id", id);
  const paths = (photos ?? []).flatMap((p) => [p.storage_path, p.jpeg_path, p.thumb_path]).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove([...new Set(paths)]);
  must(await supabase.from("items").delete().eq("id", id));
  redirect("/unlisted");
}

export async function markSold(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const result = await attempt(async () => {
    const supabase = await db();
    const itemId = requiredText(fd, "item_id", "Item");
    const platform = requiredText(fd, "platform", "Platform");
    const soldDate = isoDate(fd, "sold_date") ?? (await todayIso());
    const gross = number(fd, "gross", "Sale price");
    if (gross === null) throw new FormError("Sale price is required.");
    const item = must(await supabase.from("items").select("title, category, cost").eq("id", itemId).single());
    const plat = must(await supabase.from("platforms").select("fee_rate").eq("code", platform).single());
    const typedFees = number(fd, "fees", "Fees");
    const feeRate = Number(plat.fee_rate);

    must(
      await supabase.from("sales").insert({
        item_id: itemId,
        platform,
        order_id: text(fd, "order_id"),
        title_snapshot: item.title,
        category_snapshot: item.category,
        sold_date: soldDate,
        gross,
        shipping_cost: number(fd, "shipping_cost", "Shipping") ?? 0,
        fees: typedFees ?? Math.round(gross * feeRate * 100) / 100,
        fee_rate: typedFees === null ? feeRate : null,
        fee_is_estimate: typedFees === null,
        cogs: item.cost,
        ship_by: isoDate(fd, "ship_by"),
        buyer_name: text(fd, "buyer_name"),
        fulfillment_status: bool(fd, "already_shipped") ? "shipped" : "to_ship",
        notes: text(fd, "notes"),
      })
    );
    must(await supabase.from("items").update({ status: "sold", date_sold: soldDate }).eq("id", itemId));
    await supabase.from("item_events").insert({ item_id: itemId, action: "Sold", note: `${platform} for $${gross}` });
    // Sold somewhere else: take the eBay listing down too (FLYP does this today for her other sites)
    const note = platform !== "ebay" ? await takeOffEbay(supabase, itemId) : null;
    return { itemId, note };
  });
  if (result.ok && result.data) {
    redirect(`/items/${result.data.itemId}${result.data.note ? `?notice=${encodeURIComponent(result.data.note)}` : ""}`);
  }
  return result.ok ? { ok: true } : result;
}
