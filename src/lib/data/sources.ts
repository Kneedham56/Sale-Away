import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lotDate } from "@/lib/format";
import { FormError } from "@/lib/form";

const NUMBERED_PREFIX: Record<string, string> = { garage_sale: "GS", estate_sale: "ES" };
const FIXED_PREFIX: Record<string, string> = { facebook_marketplace: "FBMP" };

/**
 * Creates a sourcing trip with her style of lot code:
 * "GS #4-10/3/26" (4th garage sale that day), "FBMP-2/22/26", "Los Prados-9/13/25".
 */
export async function createSource(
  supabase: SupabaseClient,
  input: { type: string; place: string | null; date: string; total_spent: number | null; notes?: string | null }
): Promise<{ id: string; lot_code: string }> {
  const suffix = lotDate(input.date);
  const numbered = NUMBERED_PREFIX[input.type];
  let start = 1;
  if (numbered) {
    const { count } = await supabase
      .from("sources")
      .select("id", { count: "exact", head: true })
      .eq("type", input.type)
      .eq("date", input.date);
    start = (count ?? 0) + 1;
  }
  const name = FIXED_PREFIX[input.type] ?? input.place;
  if (!numbered && !name) throw new FormError("Give the place a name.");

  for (let attempt = 0; attempt < 20; attempt++) {
    const lot_code = numbered
      ? `${numbered} #${start + attempt}-${suffix}`
      : `${name}${attempt ? ` ${attempt + 1}` : ""}-${suffix}`;
    const { data, error } = await supabase
      .from("sources")
      .insert({
        lot_code,
        type: input.type,
        place: input.place,
        date: input.date,
        total_spent: input.total_spent,
        notes: input.notes ?? null,
      })
      .select("id, lot_code")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message); // anything but a duplicate lot code
  }
  throw new Error("Couldn't make a unique lot code for that trip.");
}
