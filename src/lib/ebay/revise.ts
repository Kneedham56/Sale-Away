// Pure helpers for pushing Sale Away edits to a live eBay listing (no server calls here, so tests can load it).

export type PackageSize = { weight_oz: number | null; length_in: number | null; width_in: number | null; height_in: number | null };
export type ConditionFields = { condition: string | null; condition_grade: string | null; condition_notes: string | null };

/** What changed on a listed item that its live eBay listing should get too. New values, since eBay goes first. */
export type ListingChanges = {
  price?: number;
  title?: string;
  condition?: ConditionFields;
  package?: PackageSize;
  /** Send her Sale Away photos (in order). `removed`: eBay picture links of photos she just deleted. */
  photos?: { removed?: string[] };
};

export function hasChanges(c: ListingChanges): boolean {
  return c.price !== undefined || !!c.title || !!c.condition || !!c.package || !!c.photos;
}

/** "price ($12.00), condition and photos" for her messages. */
export function describeChanges(c: ListingChanges): string {
  const parts = [
    c.price !== undefined && `price ($${c.price.toFixed(2)})`,
    c.title && "title",
    c.condition && "condition",
    c.package && "package size",
    c.photos && "photos",
  ].filter(Boolean) as string[];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "listing";
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Compares the item before and after her edit and returns only what eBay needs to hear about. */
export function diffForEbay(
  before: { list_price: unknown; title: string } & Record<keyof ConditionFields | keyof PackageSize, unknown>,
  after: { list_price: number | null; title: string } & ConditionFields & PackageSize
): ListingChanges {
  const out: ListingChanges = {};
  if (after.list_price !== null && after.list_price !== num(before.list_price)) out.price = after.list_price;
  if (after.title !== before.title) out.title = after.title;
  const cond: (keyof ConditionFields)[] = ["condition", "condition_grade", "condition_notes"];
  if (cond.some((k) => (after[k] ?? null) !== (before[k] ?? null))) {
    out.condition = { condition: after.condition, condition_grade: after.condition_grade, condition_notes: after.condition_notes };
  }
  const pkg: (keyof PackageSize)[] = ["weight_oz", "length_in", "width_in", "height_in"];
  if (pkg.some((k) => after[k] !== num(before[k]))) {
    out.package = { weight_oz: after.weight_oz, length_in: after.length_in, width_in: after.width_in, height_in: after.height_in };
  }
  return out;
}

export function packageDims(p: PackageSize) {
  return p.length_in && p.width_in && p.height_in
    ? { length: Number(p.length_in), width: Number(p.width_in), height: Number(p.height_in) }
    : null;
}

/**
 * Photos for a Seller Hub listing: keep the pictures she put on eBay herself (Sale Away doesn't have them),
 * then her Sale Away photos in order, minus any she just deleted. eBay allows 24.
 */
export function mergeLegacyPictures(current: string[], fromApp: string[], removed: string[] = []): string[] {
  const ours = new Set([...fromApp, ...removed]);
  const theirs = current.filter((u) => !ours.has(u));
  return [...new Set([...theirs, ...fromApp])].slice(0, 24);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type LegacyRevision = {
  price?: number;
  title?: string;
  conditionId?: number;
  /** null clears it (new items); undefined leaves it alone */
  conditionDescription?: string | null;
  package?: { weightOz: number | null; dims: { length: number; width: number; height: number } | null };
  pictureUrls?: string[];
};

/** The <Item> body of a Trading API ReviseFixedPriceItem call. */
export function legacyReviseXml(listingId: string, r: LegacyRevision): { item: string; deleted: string[] } {
  const parts = [`<ItemID>${esc(listingId)}</ItemID>`];
  const deleted: string[] = [];
  if (r.price !== undefined) parts.push(`<StartPrice>${r.price.toFixed(2)}</StartPrice>`);
  if (r.title) parts.push(`<Title>${esc(r.title.slice(0, 80))}</Title>`);
  if (r.conditionId) parts.push(`<ConditionID>${r.conditionId}</ConditionID>`);
  if (r.conditionDescription) parts.push(`<ConditionDescription>${esc(r.conditionDescription.slice(0, 1000))}</ConditionDescription>`);
  else if (r.conditionDescription === null) deleted.push("Item.ConditionDescription");
  if (r.package) {
    const { weightOz, dims } = r.package;
    const pkg = ["<MeasurementUnit>English</MeasurementUnit>"];
    if (dims) {
      pkg.push(
        `<PackageDepth unit="in">${Math.ceil(dims.height)}</PackageDepth>`,
        `<PackageLength unit="in">${Math.ceil(dims.length)}</PackageLength>`,
        `<PackageWidth unit="in">${Math.ceil(dims.width)}</PackageWidth>`
      );
    }
    if (weightOz) {
      const oz = Math.ceil(weightOz);
      pkg.push(`<WeightMajor unit="lbs">${Math.floor(oz / 16)}</WeightMajor>`, `<WeightMinor unit="oz">${oz % 16}</WeightMinor>`);
    }
    parts.push(`<ShippingPackageDetails>${pkg.join("")}</ShippingPackageDetails>`);
  }
  if (r.pictureUrls?.length) parts.push(`<PictureDetails>${r.pictureUrls.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join("")}</PictureDetails>`);
  return { item: `<Item>${parts.join("")}</Item>`, deleted };
}
