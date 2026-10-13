"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { attempt, FormError, number, requiredText, type ActionResult } from "@/lib/form";

async function db() {
  await requireMember();
  return createClient();
}

export async function saveRates(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const { data: platforms } = await supabase.from("platforms").select("code");
    for (const p of platforms ?? []) {
      const pctValue = number(fd, `fee_${p.code}`, `${p.code} fee`);
      if (pctValue === null) continue;
      if (pctValue < 0 || pctValue > 100) throw new FormError("Fee rates are percentages between 0 and 100.");
      await supabase.from("platforms").update({ fee_rate: pctValue / 100 }).eq("code", p.code);
    }
    const mileage = number(fd, "mileage_rate", "Mileage rate");
    const stale = number(fd, "stale_listing_days", "Stale days");
    const rows = [
      ...(mileage !== null ? [{ key: "mileage_rate", value: mileage }] : []),
      ...(stale !== null ? [{ key: "stale_listing_days", value: Math.round(stale) }] : []),
    ];
    if (rows.length) await supabase.from("settings").upsert(rows, { onConflict: "workspace_id,key" });
    refresh();
  });
}

/** Rename or merge a category or storage spot everywhere it's used. */
export async function renameLookup(_prev: unknown, fd: FormData): Promise<ActionResult<string>> {
  return attempt(async () => {
    const supabase = await db();
    const kind = requiredText(fd, "kind", "Kind");
    const from = requiredText(fd, "from", "Current name");
    const to = requiredText(fd, "to", "New name");
    const table = kind === "category" ? "categories" : kind === "storage" ? "storage_locations" : null;
    const column = kind === "category" ? "category" : "storage_location";
    if (!table) throw new FormError("Unknown list.");

    const { count, error } = await supabase.from("items").update({ [column]: to }, { count: "exact" }).eq(column, from);
    if (error) throw new Error(error.message);
    if (kind === "category") {
      await supabase.from("sales").update({ category_snapshot: to }).eq("category_snapshot", from);
      await supabase.from("categories").upsert({ name: to }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    } else {
      await supabase
        .from("storage_locations")
        .upsert({ name: to, kind: /^\d+$/.test(to) ? "bin" : "place" }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    }
    await supabase.from(table).delete().eq("name", from);
    refresh();
    return `Moved ${count ?? 0} item${count === 1 ? "" : "s"} from “${from}” to “${to}”.`;
  });
}

export async function addLookup(_prev: unknown, fd: FormData): Promise<ActionResult<string>> {
  return attempt(async () => {
    const supabase = await db();
    const kind = requiredText(fd, "kind", "Kind");
    const name = requiredText(fd, "name", "Name");
    const { error } =
      kind === "category"
        ? await supabase.from("categories").upsert({ name, sort_order: 999 }, { onConflict: "workspace_id,name", ignoreDuplicates: true })
        : await supabase
            .from("storage_locations")
            .upsert({ name, kind: /^\d+$/.test(name) ? "bin" : "place" }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    refresh();
    return `Added “${name}”.`;
  });
}

const TEXT_SETTINGS = ["ai_listing_prompt", "ai_quick_prompt", "store_rules", "description_template", "ai_listing_model", "ai_quick_model"];

export async function saveAiSettings(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    const supabase = await db();
    const rows = TEXT_SETTINGS.map((key) => ({ key, value: String(fd.get(key) ?? "").trim() }));
    for (const r of rows) {
      if (/model$/.test(r.key) && r.value && !/^[a-z0-9.\-]+$/i.test(r.value)) throw new FormError("Model names look like gemini-flash-latest.");
    }
    const { error } = await supabase.from("settings").upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "workspace_id,key" }
    );
    if (error) throw new Error(error.message);
    refresh();
  });
}
