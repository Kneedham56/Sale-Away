"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { settingNumber } from "@/lib/data/lookups";
import { attempt, FormError, isoDate, number, requiredText, text, type ActionResult } from "@/lib/form";

async function db() {
  await requireMember();
  return createClient();
}

export async function addExpense(_prev: unknown, fd: FormData): Promise<ActionResult<number>> {
  return attempt(async () => {
    const supabase = await db();
    const amount = number(fd, "amount", "Amount");
    if (amount === null) throw new FormError("Amount is required.");
    const { error } = await supabase.from("expenses").insert({
      date: isoDate(fd, "date") ?? (await todayIso()),
      description: requiredText(fd, "description", "Description"),
      type: requiredText(fd, "type", "Type"),
      amount,
      notes: text(fd, "notes"),
    });
    if (error) throw new Error(error.message);
    refresh();
    return Date.now(); // a fresh value each time, used to reset the form
  });
}

export async function addMileage(_prev: unknown, fd: FormData): Promise<ActionResult<number>> {
  return attempt(async () => {
    const supabase = await db();
    const miles = number(fd, "miles", "Miles");
    if (!miles) throw new FormError("Miles are required.");
    const { data: setting } = await supabase.from("settings").select("value").eq("key", "mileage_rate").maybeSingle();
    const rate = settingNumber({ mileage_rate: setting?.value }, "mileage_rate", 0.725);
    const { error } = await supabase.from("mileage").insert({
      date: isoDate(fd, "date") ?? (await todayIso()),
      miles,
      rate,
      purpose: text(fd, "purpose"),
      source_id: text(fd, "source_id"),
    });
    if (error) throw new Error(error.message);
    refresh();
    return Date.now(); // a fresh value each time, used to reset the form
  });
}

export async function deleteEntry(fd: FormData) {
  const supabase = await db();
  const table = requiredText(fd, "table", "Table");
  if (table !== "expenses" && table !== "mileage") throw new FormError("Unknown table.");
  await supabase.from(table).delete().eq("id", requiredText(fd, "id", "Entry"));
  refresh();
}
