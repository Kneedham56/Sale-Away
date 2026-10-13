import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/photos";
import { getLookups, settingNumber } from "@/lib/data/lookups";
import { KIND_LABELS, money, shortDate } from "@/lib/format";
import { Empty, ItemRow } from "@/components/item-row";

type Params = Record<string, string | string[] | undefined>;
const PAGE = 50;

function one(p: Params, key: string): string {
  const v = p[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Strips characters that PostgREST's or() filter syntax treats as separators. */
function safeSearch(q: string) {
  return q.replace(/[,()*%\\]/g, " ").trim();
}

function hrefWith(base: string, params: Params, patch: Record<string, string | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) sp.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function ItemList({ mode, params }: { mode: "unlisted" | "listed"; params: Params }) {
  const supabase = await createClient();
  const base = `/${mode}`;
  const q = safeSearch(one(params, "q"));
  const kind = one(params, "kind");
  const category = one(params, "category");
  const trip = one(params, "trip");
  const sort = one(params, "sort") || (mode === "listed" ? "oldest" : "newest");
  const stale = one(params, "stale") === "1";
  const limit = Math.min(Number(one(params, "limit")) || PAGE, 2000);

  const lookups = await getLookups(supabase);
  const staleDays = settingNumber(lookups.settings, "stale_listing_days", 90);

  let query = supabase
    .from("items_view")
    .select("id, title, kind, category, format, cost, list_price, storage_location, lot_code, date_sourced, date_listed, days_active, thumb_path", { count: "exact" });
  query = mode === "unlisted" ? query.in("status", ["intake", "unlisted", "ready_to_list"]) : query.eq("status", "listed");
  if (q) query = query.or(`title.ilike.%${q}%,storage_location.ilike.%${q}%,lot_code.ilike.%${q}%,sku.ilike.%${q}%`);
  if (kind) query = query.eq("kind", kind);
  if (category) query = query.eq("category", category);
  if (trip) query = query.eq("lot_code", trip);
  if (stale) query = query.gte("days_active", staleDays);

  if (mode === "listed") {
    if (sort === "newest") query = query.order("date_listed", { ascending: false, nullsFirst: false });
    else if (sort === "price") query = query.order("list_price", { ascending: false, nullsFirst: false });
    else if (sort === "storage") query = query.order("storage_location", { nullsFirst: false });
    else query = query.order("date_listed", { ascending: true, nullsFirst: false });
  } else {
    if (sort === "oldest") query = query.order("date_sourced", { ascending: true, nullsFirst: false });
    else if (sort === "cost") query = query.order("cost", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false }).order("date_sourced", { ascending: false, nullsFirst: false });
  }
  const { data: items, count, error } = await query.range(0, limit - 1);
  if (error) throw new Error(error.message);

  const urls = await signPaths(supabase, (items ?? []).map((i) => i.thumb_path));
  const sorts =
    mode === "listed"
      ? [["oldest", "Longest listed"], ["newest", "Newest"], ["price", "Price"], ["storage", "Storage spot"]]
      : [["newest", "Newest"], ["oldest", "Oldest"], ["cost", "Cost"]];

  return (
    <div className="space-y-3">
      <form className="flex gap-2" action={base}>
        <input
          name="q"
          defaultValue={one(params, "q")}
          className="input"
          type="search"
          placeholder={mode === "listed" ? "Search title, storage spot, lot…" : "Search title or lot…"}
          enterKeyHint="search"
        />
        {kind && <input type="hidden" name="kind" value={kind} />}
        {stale && <input type="hidden" name="stale" value="1" />}
        {category && <input type="hidden" name="category" value={category} />}
        {trip && <input type="hidden" name="trip" value={trip} />}
        <button className="btn-small min-h-12 px-4">Search</button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {mode === "unlisted" ? (
          <>
            <Link href={hrefWith(base, params, { kind: null, limit: null })} className={`chip shrink-0 ${!kind ? "chip-active" : ""}`}>
              All
            </Link>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <Link key={k} href={hrefWith(base, params, { kind: k, limit: null })} className={`chip shrink-0 ${kind === k ? "chip-active" : ""}`}>
                {label === "General" ? "General" : `${label}s`}
              </Link>
            ))}
          </>
        ) : (
          <Link
            href={hrefWith(base, params, { stale: stale ? null : "1", limit: null })}
            className={`chip shrink-0 ${stale ? "chip-active" : ""}`}
          >
            Stale ({staleDays}+ days)
          </Link>
        )}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {sorts.map(([k, label]) => (
          <Link key={k} href={hrefWith(base, params, { sort: k, limit: null })} className={`chip shrink-0 ${sort === k ? "chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>

      {(category || trip) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {category && (
            <Link href={hrefWith(base, params, { category: null })} className="chip chip-active">
              {category} ×
            </Link>
          )}
          {trip && (
            <Link href={hrefWith(base, params, { trip: null })} className="chip chip-active">
              Trip {trip} ×
            </Link>
          )}
        </div>
      )}

      <p className="text-sm text-muted">
        {(count ?? 0).toLocaleString()} item{count === 1 ? "" : "s"}
      </p>

      {!items?.length ? (
        <Empty>{q || kind || stale ? "Nothing matches." : mode === "unlisted" ? "Nothing waiting to be listed." : "Nothing listed yet."}</Empty>
      ) : (
        <ul className="list">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              href={`/items/${it.id}`}
              thumbUrl={it.thumb_path ? urls.get(it.thumb_path) : null}
              title={it.title}
              meta={
                mode === "listed"
                  ? [it.storage_location && `📦 ${it.storage_location}`, it.days_active !== null && `${it.days_active} days`, it.category]
                      .filter(Boolean)
                      .join(" · ")
                  : [it.format ?? it.category, it.lot_code, it.date_sourced && shortDate(it.date_sourced)].filter(Boolean).join(" · ")
              }
              right={
                mode === "listed" ? (
                  <span className="font-medium">{money(it.list_price)}</span>
                ) : (
                  <span className="text-muted">{money(it.cost)}</span>
                )
              }
            />
          ))}
        </ul>
      )}

      {(count ?? 0) > limit && (
        <Link href={hrefWith(base, params, { limit: String(limit + PAGE) })} scroll={false} className="btn-secondary w-full">
          Show more
        </Link>
      )}
    </div>
  );
}
