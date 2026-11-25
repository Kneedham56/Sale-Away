// Listing queue: a batch of photos -> one item per group -> AI listing -> quick send or full review.
// Pure helpers (no server or browser calls) so both sides and the tests can use them.

/** Title a batch item has until she accepts its listing; the AI is told to identify the item from the photos. */
export const BATCH_TITLE = "New item from photo batch";

export const isBatchTitle = (t: string | null | undefined) => t === BATCH_TITLE;

/** Group sizes from the photo index where each item starts ([0, 4, 7] over 10 photos -> [4, 3, 3]). */
export function groupsFromStarts(count: number, starts: number[]): number[] {
  const s = [...new Set([0, ...starts.filter((i) => Number.isInteger(i) && i > 0 && i < count)])].sort((a, b) => a - b);
  if (!count) return [];
  return s.map((start, k) => (s[k + 1] ?? count) - start);
}

/** Every N photos is one item (her "4 photos per item" habit). */
export function everyN(count: number, n: number): number[] {
  const size = Math.max(1, Math.floor(n) || 1);
  const out: number[] = [];
  for (let left = count; left > 0; left -= size) out.push(Math.min(size, left));
  return out;
}

/** Start a new item at photo `index` (counted over the whole batch). */
export function splitAt(sizes: number[], index: number): number[] {
  const out: number[] = [];
  let start = 0;
  for (const size of sizes) {
    const cut = index - start;
    if (cut > 0 && cut < size) out.push(cut, size - cut);
    else out.push(size);
    start += size;
  }
  return out;
}

/** Fold item `g` into the one before it. */
export function mergeUp(sizes: number[], g: number): number[] {
  if (g <= 0 || g >= sizes.length) return sizes;
  const out = [...sizes];
  out[g - 1] += out[g];
  out.splice(g, 1);
  return out;
}

/** Split a flat list into the groups. */
export function chunk<T>(list: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const size of sizes) {
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}

export type QueueLane = "quick" | "review";

/**
 * Cheap, straightforward items get a quick check and one-tap send; anything pricier, unpriced, flagged by the AI
 * (missing specifics, slow model, unverified price) or marked DONATE gets her full review.
 */
export function laneFor(s: { price: number | null; decision: string; flags?: string[]; confidence?: string }, quickMax: number): QueueLane {
  if (s.decision !== "KEEP" || s.price === null || s.price > quickMax) return "review";
  if ((s.flags ?? []).some((f) => /requires these specifics|faster \(less accurate\) model|no photos/i.test(f))) return "review";
  return "quick";
}
