import type { CategorySuggestion } from "./types";

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
      .filter((w) => w.length > 2 && !["and", "the", "other", "contemp", "contemporary", "now"].includes(w))
  );

/** How well an eBay category's path matches the path the AI picked (0..1), with the last level counting double. */
export function pathScore(aiPath: string, candidate: CategorySuggestion): number {
  const levels = aiPath.split(/\s*[>:]\s*/).filter(Boolean);
  const want = words(aiPath);
  const leaf = words(levels[levels.length - 1] ?? "");
  const have = words(candidate.path);
  const haveLeaf = words(candidate.categoryName);
  if (!want.size) return 0;
  const shared = [...want].filter((w) => have.has(w)).length / want.size;
  const leafShared = leaf.size ? [...leaf].filter((w) => haveLeaf.has(w)).length / leaf.size : 0;
  return (shared + leafShared * 2) / 3;
}

/**
 * The eBay category id for the AI's category path. eBay's search ranks loosely (a Disneyana > Housewares path once came
 * back with "Books & Magazines > Magazines" first), so ask with the full path, its last level, and the title, then keep
 * the suggestion whose path best matches what the AI chose.
 */
export async function resolveCategory(
  suggest: (q: string) => Promise<CategorySuggestion[]>,
  aiPath: string | null,
  title: string
): Promise<CategorySuggestion | null> {
  if (!aiPath) return (await suggest(title).catch(() => []))[0] ?? null;
  const leaf = aiPath.split(/\s*[>:]\s*/).filter(Boolean).pop() ?? aiPath;
  const lists = await Promise.all([aiPath, leaf, title].map((q) => suggest(q).catch(() => [] as CategorySuggestion[])));
  const seen = new Map<string, CategorySuggestion>();
  for (const s of lists.flat()) if (!seen.has(s.categoryId)) seen.set(s.categoryId, s);
  let best: CategorySuggestion | null = null;
  let bestScore = -1;
  for (const s of seen.values()) {
    const score = pathScore(aiPath, s);
    if (score > bestScore) [best, bestScore] = [s, score];
  }
  return best;
}
