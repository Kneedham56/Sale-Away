// Her eBay Store's own shop categories (Men's > Shirts, Housewares, Holiday > Christmas, ...): which one a listing goes in.

export type StoreCategory = {
  id: string;
  /** eBay's path for the Inventory API, e.g. "Holiday/Christmas" (how eBay itself stores her picks) */
  path: string;
  /** "Holiday › Christmas" */
  label: string;
};

// Her Sale Away words -> also count as these words from her store category names
const ALSO: Record<string, string[]> = {
  dvd: ["video"], media: ["video"], movie: ["video"], film: ["video"], bluray: ["video"], vhs: ["video"],
  cd: ["music"], vinyl: ["music"], record: ["music"], album: ["music"],
  novel: ["book"], paperback: ["book"], hardcover: ["book"],
  plush: ["toy"], doll: ["toy"], puzzle: ["game"],
  kitchen: ["housewares"], dinnerware: ["housewares"], dish: ["housewares"], pottery: ["housewares"], decor: ["housewares"],
  xmas: ["christmas"],
  ladies: ["women"], womens: ["women"], mens: ["men"],
  shirt: ["top", "shirt"], blouse: ["top"], tee: ["top"],
  lingere: ["lingerie"], bra: ["lingerie"], robe: ["robe"], pajama: ["sleepwear"],
  active: ["activewear"], athletic: ["activewear"],
  shoe: ["footwear", "shoe"], boot: ["footwear", "shoe"], sneaker: ["footwear", "shoe"],
  purse: ["handbag"], wallet: ["wallet"], dress: ["dress"], skirt: ["skirt"],
};

const stem = (w: string) =>
  w.endsWith("ies") ? `${w.slice(0, -3)}y` : /(ss|x|sh|ch)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;

const words = (s: string | null | undefined) =>
  new Set(
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ'’]/g, "")
      .split(/[^a-z0-9]+/)
      .flatMap((w) => [stem(w), ...(ALSO[w] ?? ALSO[stem(w)] ?? []).map(stem)])
      .filter((w) => w.length > 2 && !["and", "the", "other"].includes(w))
  );

/**
 * Best store category for an item: what she picked last time for the same Sale Away category, otherwise the one whose
 * name best matches her category (strongest), eBay's category, then the title. Subcategories need their parent to match
 * too (Women's > Tops, Holiday > Christmas). null when nothing matches (eBay then files it under Other).
 */
export function guessStoreCategory(
  cats: StoreCategory[],
  item: { category: string | null; ebay_category_name: string | null; title: string },
  learned: Record<string, string> = {}
): StoreCategory | null {
  const remembered = item.category ? learned[item.category.toLowerCase()] : null;
  if (remembered) {
    const hit = cats.find((c) => c.path === remembered);
    if (hit) return hit;
  }
  const mine = words(item.category);
  const ebay = words(item.ebay_category_name);
  const title = words(item.title);
  const scoreName = (name: string) =>
    [...words(name)].reduce((s, w) => s + (mine.has(w) ? 3 : 0) + (ebay.has(w) ? 2 : 0) + (title.has(w) ? 1 : 0), 0);

  let best: StoreCategory | null = null;
  let bestScore = 0;
  for (const c of cats) {
    const parts = c.path.split("/").filter(Boolean);
    const own = scoreName(parts[parts.length - 1]);
    if (!own) continue;
    const parent = parts.length > 1 ? scoreName(parts[0]) : 0;
    if (parts.length > 1 && !parent) continue;
    const score = own + parent;
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}
