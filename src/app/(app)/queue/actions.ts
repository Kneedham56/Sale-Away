"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, type ActionResult } from "@/lib/form";
import { todayIso } from "@/lib/dates";
import { groupPhotoBatch } from "@/lib/ai/group";
import { BATCH_TITLE } from "@/lib/queue";
import { PHOTO_BUCKET } from "@/lib/photos";
import type { NewPhoto } from "../items/actions";

/** The AI sorts a batch of photos (small previews, in order) into items. Returns the size of each item's group. */
export async function groupPhotos(previews: string[]): Promise<ActionResult<number[]>> {
  return attempt(async () => {
    await requireMember();
    if (!previews.length) throw new FormError("Pick some photos first.");
    if (previews.length > 120) throw new FormError("That's a lot of photos: do up to 120 at a time.");
    return groupPhotoBatch(await createClient(), previews);
  });
}

export type BatchDefaults = {
  sourceId: string | null;
  storage: string | null;
  cost: number | null;
  condition: "new" | "pre_owned" | null;
  grade: "excellent" | "good" | "acceptable" | null;
};

/** One item from a group of already-uploaded photos (upsert on her phone-made id, so a retry can't duplicate it). */
export async function createBatchItem(id: string, photos: NewPhoto[], d: BatchDefaults): Promise<ActionResult> {
  return attempt(async () => {
    await requireMember();
    if (!photos.length) throw new FormError("No photos for this item.");
    const supabase = await createClient();
    let date_sourced = await todayIso();
    if (d.sourceId) {
      const { data } = await supabase.from("sources").select("date").eq("id", d.sourceId).single();
      date_sourced = data?.date ?? date_sourced;
    }
    const { error } = await supabase.from("items").upsert({
      id,
      title: BATCH_TITLE,
      kind: "general",
      status: "intake",
      source_id: d.sourceId,
      date_sourced,
      storage_location: d.storage,
      cost: d.cost,
      condition: d.condition,
      condition_grade: d.condition === "pre_owned" ? d.grade : null,
    });
    if (error) throw new Error(error.message);
    await supabase.from("item_photos").delete().eq("item_id", id);
    const ins = await supabase.from("item_photos").insert(photos.map((p, i) => ({ item_id: id, ...p, sort_order: i })));
    if (ins.error) throw new Error(ins.error.message);
    if (d.storage) {
      await supabase
        .from("storage_locations")
        .upsert({ name: d.storage, kind: /^\d+$/.test(d.storage) ? "bin" : "place" }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    }
    await supabase.from("item_events").insert({ item_id: id, action: "Added from photo batch", note: `${photos.length} photos` });
  });
}

/** Removes a batch item she doesn't want (e.g. photos grouped wrong). Only items still waiting in the queue. */
export async function discardBatchItem(id: string): Promise<ActionResult> {
  return attempt(async () => {
    await requireMember();
    const supabase = await createClient();
    const { data: item } = await supabase.from("items").select("status").eq("id", id).single();
    if (!item || !["intake", "unlisted"].includes(item.status)) throw new FormError("Only items still in the queue can be removed here.");
    const { data: photos } = await supabase.from("item_photos").select("storage_path, jpeg_path, thumb_path").eq("item_id", id);
    const paths = (photos ?? []).flatMap((p) => [p.storage_path, p.jpeg_path, p.thumb_path]).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove([...new Set(paths)]);
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function refreshQueue(): Promise<void> {
  refresh();
}
