// Fuzzy title matching for the cleanup screen: listings retitled on eBay still share most of their words.

const STOP = new Set(["the", "and", "for", "with", "new", "vtg", "vintage", "lot", "size", "womens", "mens", "of", "in"]);

export function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

/** 0..1: share of words in common (Jaccard). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
}

/** Best match above a threshold, or null. */
export function bestMatch<T>(title: string, candidates: { value: T; words: Set<string> }[], threshold = 0.35) {
  const w = words(title);
  let best: { value: T; score: number } | null = null;
  for (const c of candidates) {
    const s = similarity(w, c.words);
    if (s >= threshold && (!best || s > best.score)) best = { value: c.value, score: s };
  }
  return best;
}
