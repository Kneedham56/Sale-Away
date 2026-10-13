"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { createSource } from "@/lib/data/sources";
import { todayIso } from "@/lib/dates";
import { attempt, FormError, isoDate, number, requiredText, text, type ActionResult } from "@/lib/form";
import { SOURCE_TYPES } from "@/lib/format";

async function db() {
  await requireMember();
  return createClient();
}

function tripType(fd: FormData) {
  const type = requiredText(fd, "type", "Type");
  if (!SOURCE_TYPES[type]) throw new FormError("Unknown trip type.");
  return type;
}

export async function createTrip(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const result = await attempt(async () => {
    const supabase = await db();
    return createSource(supabase, {
      type: tripType(fd),
      place: text(fd, "place"),
      date: isoDate(fd, "date") ?? (await todayIso()),
      total_spent: number(fd, "total_spent", "Total spent"),
      notes: text(fd, "notes"),
    });
  });
  if (result.ok && result.data) redirect(`/trips/${result.data.id}`);
  return result.ok ? { ok: true } : result;
}

export async function updateTrip(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const id = requiredText(fd, "id", "Trip");
    const { error } = await supabase
      .from("sources")
      .update({
        lot_code: requiredText(fd, "lot_code", "Lot code"),
        type: tripType(fd),
        place: text(fd, "place"),
        date: isoDate(fd, "date"),
        total_spent: number(fd, "total_spent", "Total spent"),
        notes: text(fd, "notes"),
      })
      .eq("id", id);
    if (error) throw new FormError(error.code === "23505" ? "Another trip already has that lot code." : error.message);
    refresh();
  });
}

export async function deleteTrip(fd: FormData) {
  const supabase = await db();
  const id = requiredText(fd, "id", "Trip");
  const { count } = await supabase.from("items").select("id", { count: "exact", head: true }).eq("source_id", id);
  if (count) throw new FormError("This trip still has items.");
  await supabase.from("sources").delete().eq("id", id);
  redirect("/trips");
}
