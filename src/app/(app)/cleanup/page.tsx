import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bestMatch, words } from "@/lib/similar";
import { money, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/item-row";
import { resolveAppItem, resolveLiveListing } from "./actions";

export const metadata: Metadata = { title: "Cleanup" };
export const maxDuration = 120;

// Temporary screen for the one-time cleanup after connecting eBay. Remove once both lists are empty.

type AppItem = { id: string; title: string; storage_location: string | null; date_listed: string | null; list_price: number | null };
type Live = { listing_id: string; title: string; price: number | null; start_time: string | null };
const PAGE = 15;

async function loadAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

export default async function CleanupPage({ searchParams }: PageProps<"/cleanup">) {
  await requireMember();
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && sp.tab !== "questions" ? sp.tab : "app";
  const supabase = await createClient();

  const [notLive, liveRows, skippedRow, unlinkedSales] = await Promise.all([
    loadAll<AppItem>((f, t) =>
      supabase.from("items").select("id, title, storage_location, date_listed, list_price").eq("status", "listed").is("ebay_item_id", null).order("date_listed").range(f, t)
    ),
    loadAll<Live & { item_id: string | null }>((f, t) =>
      supabase.from("ebay_active_listings").select("listing_id, title, price, start_time, item_id").is("item_id", null).order("start_time").range(f, t)
    ),
    supabase.from("settings").select("value").eq("key", "cleanup_skipped").maybeSingle(),
    supabase.from("sales_view").select("id, title, sold_date, gross, platform").is("item_id", null).gte("sold_date", "2026-10-01"),
  ]);
  const skipped = new Set(Array.isArray(skippedRow.data?.value) ? (skippedRow.data!.value as string[]) : []);
  const notInApp = liveRows.filter((l) => !skipped.has(l.listing_id));

  const tabs = [
    ["app", "In the app, not on eBay", `${notLive.length} left`],
    ["ebay", "On eBay, not in the app", `${notInApp.length} left`],
    ["sales", "Sales to match", `${unlinkedSales.data?.length ?? 0} left`],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="One-time cleanup"
        subtitle="Now that Sale Away can see your eBay, let's tidy a few things up. Do a few at a time; everything saves as you go."
      />
      <div className="mb-5 grid grid-cols-3 gap-2">
        {tabs.map(([key, label, count]) => (
          <Link
            key={key}
            href={`/cleanup?tab=${key}`}
            className={`card px-3 py-2.5 text-sm ${tab === key ? "border-accent bg-accent/5" : ""}`}
          >
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-muted">{count}</span>
          </Link>
        ))}
      </div>

      {tab === "app" && <NotOnEbay items={notLive} live={notInApp} page={Number(sp.page) || 0} />}
      {tab === "ebay" && <NotInApp live={notInApp} supabase={supabase} page={Number(sp.page) || 0} />}

      {tab === "sales" && (
        <section className="space-y-3">
          <p className="text-sm text-muted">These eBay sales came in but Sale Away couldn&apos;t tell which item they were. Tap one to pick the item.</p>
          {!unlinkedSales.data?.length ? (
            <Empty>All matched. 🎉</Empty>
          ) : (
            <ul className="list">
              {unlinkedSales.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/sales/${s.id}`} className="flex justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="block font-medium">{s.title}</span>
                      <span className="text-xs text-muted">
                        {s.platform} · {shortDate(s.sold_date)}
                      </span>
                    </span>
                    <span className="font-medium">{money(s.gross)} ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Pager({ tab, page, total }: { tab: string; page: number; total: number }) {
  if (total <= PAGE) return null;
  return (
    <div className="mt-3 flex justify-between text-sm">
      {page > 0 ? <Link href={`/cleanup?tab=${tab}&page=${page - 1}`} className="btn-small">‹ Previous</Link> : <span />}
      <span className="text-muted">
        {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
      </span>
      {(page + 1) * PAGE < total ? <Link href={`/cleanup?tab=${tab}&page=${page + 1}`} className="btn-small">Next ›</Link> : <span />}
    </div>
  );
}

function NotOnEbay({ items, live, page }: { items: AppItem[]; live: Live[]; page: number }) {
  const candidates = live.map((l) => ({ value: l, words: words(l.title) }));
  const shown = items.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        Your spreadsheet says these are listed, but they aren&apos;t live on eBay right now. What happened to each one?
      </p>
      {!items.length && <Empty>All done here. 🎉</Empty>}
      <ul className="space-y-3">
        {shown.map((it) => {
          const match = bestMatch(it.title, candidates);
          return (
            <li key={it.id} className="card space-y-2 p-3">
              <div>
                <Link href={`/items/${it.id}`} className="font-medium">
                  {it.title}
                </Link>
                <div className="text-xs text-muted">
                  {it.storage_location && `📦 ${it.storage_location} · `}listed {shortDate(it.date_listed)}
                  {it.list_price !== null && ` · ${money(it.list_price)}`}
                </div>
              </div>
              <form action={resolveAppItem} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={it.id} />
                {match && (
                  <div className="w-full rounded-xl bg-accent/5 p-2 text-sm">
                    Maybe it&apos;s this one on eBay (title changed): <strong>{match.value.title}</strong> {money(match.value.price)}{" "}
                    <button name="choice" value={`same:${match.value.listing_id}`} className="btn-small mt-1">
                      Yes, same item
                    </button>
                  </div>
                )}
                <button name="choice" value="sold" className="btn-small">It sold already</button>
                <button name="choice" value="still_have" className="btn-small">Not listed, I still have it</button>
                <button name="choice" value="gone" className="btn-small">Gone (donated / tossed)</button>
              </form>
            </li>
          );
        })}
      </ul>
      <Pager tab="app" page={page} total={items.length} />
    </section>
  );
}

async function NotInApp({ live, supabase, page }: { live: Live[]; supabase: Awaited<ReturnType<typeof createClient>>; page: number }) {
  // Possible matches: her items not linked to eBay yet
  const unlinked = await loadAll<{ id: string; title: string; status: string }>((f, t) =>
    supabase.from("items").select("id, title, status").is("ebay_item_id", null).in("status", ["listed", "unlisted", "ready_to_list", "intake"]).range(f, t)
  );
  const candidates = unlinked.map((i) => ({ value: i, words: words(i.title) }));
  const shown = live.slice(page * PAGE, (page + 1) * PAGE);
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        These are live on eBay but Sale Away doesn&apos;t have them (listed after the spreadsheet, or the title is different). Add each one
        so its sale shows up properly.
      </p>
      {!live.length && <Empty>All done here. 🎉</Empty>}
      <ul className="space-y-3">
        {shown.map((l) => {
          const match = bestMatch(l.title, candidates);
          return (
            <li key={l.listing_id} className="card space-y-2 p-3">
              <div>
                <a href={`https://www.ebay.com/itm/${l.listing_id}`} target="_blank" rel="noreferrer" className="font-medium">
                  {l.title} ↗
                </a>
                <div className="text-xs text-muted">
                  {money(l.price)} · listed {shortDate(l.start_time?.slice(0, 10))}
                </div>
              </div>
              <form action={resolveLiveListing} className="space-y-2">
                <input type="hidden" name="listing_id" value={l.listing_id} />
                {match && (
                  <div className="rounded-xl bg-accent/5 p-2 text-sm">
                    Is it this item you already have? <strong>{match.value.title}</strong>{" "}
                    <button name="choice" value={`same:${match.value.id}`} className="btn-small mt-1">
                      Yes, same item
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input name="cost" className="input w-28 px-3 py-2" inputMode="decimal" placeholder="Cost $ (optional)" />
                  <input name="storage_location" className="input w-36 px-3 py-2" placeholder="Storage (optional)" />
                  <button name="choice" value="add" className="btn-small">Add to Sale Away</button>
                  <button name="choice" value="skip" className="btn-small text-muted">Skip</button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
      <Pager tab="ebay" page={page} total={live.length} />
    </section>
  );
}
