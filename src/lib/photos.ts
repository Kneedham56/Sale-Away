import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "item-photos";

/** Signed URLs (1 hour) for many storage paths in one call. */
export async function signPaths(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 3600);
  for (const row of data ?? []) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  return map;
}
