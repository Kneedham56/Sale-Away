import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SourceOption = { id: string; lot_code: string; place: string | null; type: string; date: string | null };
export type Platform = { code: string; name: string; fee_rate: number };

export type Lookups = {
  categories: string[];
  storageLocations: string[];
  platforms: Platform[];
  sources: SourceOption[];
  settings: Record<string, unknown>;
};

export async function getLookups(supabase: SupabaseClient): Promise<Lookups> {
  const [cats, locs, plats, srcs, sets] = await Promise.all([
    supabase.from("categories").select("name").order("sort_order").order("name"),
    supabase.from("storage_locations").select("name").order("name").limit(5000),
    supabase.from("platforms").select("code, name, fee_rate").eq("active", true).order("sort_order"),
    supabase
      .from("sources")
      .select("id, lot_code, place, type, date")
      .order("date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("settings").select("key, value"),
  ]);
  return {
    categories: (cats.data ?? []).map((c) => c.name),
    storageLocations: (locs.data ?? []).map((l) => l.name),
    platforms: (plats.data ?? []).map((p) => ({ ...p, fee_rate: Number(p.fee_rate) })),
    sources: srcs.data ?? [],
    settings: Object.fromEntries((sets.data ?? []).map((s) => [s.key, s.value])),
  };
}

export function settingNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(settings[key]);
  return Number.isFinite(v) ? v : fallback;
}
