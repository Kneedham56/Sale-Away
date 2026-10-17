import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/photos";
import { EXIT_LABELS, money, shortDate, STAGE_STATUSES, type ItemStatus } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty, ItemRow } from "@/components/item-row";

export const metadata: Metadata = { title: "Completed" };

const FILTERS: [string, string, ItemStatus[]][] = [
  ["all", "All", STAGE_STATUSES.completed],
  ["shipped", "Shipped", ["shipped"]],
  ["gave-up", "Gave up / gone", ["discarded", "donated", "damaged", "kept"]],
];
const PAGE = 50;

export default async function CompletedPage({ searchParams }: PageProps<"/completed">) {
  await requireMember();
  const sp = await searchParams;
  const filter = FILTERS.find(([k]) => k === sp.f) ?? FILTERS[0];
  const q = typeof sp.q === "string" ? sp.q.replace(/[,()*%\\]/g, " ").trim() : "";
  const limit = Math.min(Number(sp.limit) || PAGE, 2000);
  const supabase = await createClient();

  let query = supabase
    .from("items_view")
    .select("id, title, status, date_sold, date_exited, storage_location, thumb_path, lot_code, cost", { count: "exact" })
    .in("status", filter[2])
    .order("updated_at", { ascending: false });
  if (q) query = query.or(`title.ilike.%${q}%,lot_code.ilike.%${q}%`);
  const { data: items, count } = await query.range(0, limit - 1);

  const ids = (items ?? []).map((i) => i.id);
  const [urls, { data: sales }] = await Promise.all([
    signPaths(supabase, (items ?? []).map((i) => i.thumb_path)),
    ids.length
      ? supabase.from("sales_view").select("item_id, platform, gross, adjusted_net, sold_date").in("item_id", ids)
      : Promise.resolve({ data: [] as { item_id: string; platform: string; gross: number; adjusted_net: number; sold_date: string }[] }),
  ]);
  const saleFor = new Map((sales ?? []).map((s) => [s.item_id, s]));
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { f: filter[0] === "all" ? null : filter[0], q: q || null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/completed${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Completed" subtitle="Shipped, or taken down for good. The end of the line." />
      <form className="mb-3 flex gap-2" action="/completed">
        {filter[0] !== "all" && <input type="hidden" name="f" value={filter[0]} />}
        <input name="q" defaultValue={q} className="input" type="search" placeholder="Search title or lot…" />
        <button className="btn-small min-h-12 px-4">Search</button>
      </form>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={href({ f: k === "all" ? null : k, limit: null })} className={`chip ${filter[0] === k ? "chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      <p className="mb-2 text-sm text-muted">{(count ?? 0).toLocaleString()} items</p>
      {!items?.length ? (
        <Empty>Nothing completed yet.</Empty>
      ) : (
        <ul className="list">
          {items.map((it) => {
            const sale = saleFor.get(it.id);
            const status = it.status as ItemStatus;
            return (
              <ItemRow
                key={it.id}
                href={`/items/${it.id}`}
                thumbUrl={it.thumb_path ? urls.get(it.thumb_path) : null}
                title={it.title}
                meta={
                  status === "shipped"
                    ? `Shipped · ${sale ? `${sale.platform} · ` : ""}sold ${shortDate(sale?.sold_date ?? it.date_sold)}`
                    : `${EXIT_LABELS[status] ?? status} · ${shortDate(it.date_exited)}`
                }
                right={
                  sale ? (
                    <>
                      <div className="font-medium">{money(sale.gross)}</div>
                      <div className={Number(sale.adjusted_net) < 0 ? "text-xs text-danger" : "text-xs text-ok"}>{money(sale.adjusted_net)}</div>
                    </>
                  ) : (
                    <span className="text-xs text-muted">cost {money(it.cost)}</span>
                  )
                }
              />
            );
          })}
        </ul>
      )}
      {(count ?? 0) > limit && (
        <Link href={href({ limit: String(limit + PAGE) })} scroll={false} className="btn-secondary mt-3 w-full">
          Show more
        </Link>
      )}
    </>
  );
}
