import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { money, shortDate, SOURCE_TYPES } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/item-row";
import { NewTripForm } from "./trip-forms";

export const metadata: Metadata = { title: "Sourcing trips" };

export default async function TripsPage({ searchParams }: PageProps<"/trips">) {
  await requireMember();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[,()*%\\]/g, " ").trim() : "";
  const sort = sp.sort === "profit" ? "profit" : sp.sort === "items" ? "items" : "date";
  const supabase = await createClient();
  const today = await todayIso();

  let query = supabase.from("source_report").select("*");
  if (q) query = query.or(`lot_code.ilike.%${q}%,place.ilike.%${q}%`);
  query =
    sort === "profit"
      ? query.order("adjusted_net", { ascending: false })
      : sort === "items"
        ? query.order("items", { ascending: false })
        : query.order("date", { ascending: false, nullsFirst: false });
  const { data: trips } = await query.limit(200);

  return (
    <>
      <PageHeader title="Sourcing trips" subtitle="Her notebook: where things came from, what they cost, what they earned." />

      <details className="card mb-4 p-4">
        <summary className="cursor-pointer font-medium">+ New trip</summary>
        <div className="mt-4">
          <NewTripForm today={today} />
        </div>
      </details>

      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} className="input" type="search" placeholder="Search lot code or place" />
        <button className="btn-small min-h-12">Search</button>
      </form>
      <div className="mb-3 flex gap-2">
        {[["date", "Newest"], ["profit", "Most profit"], ["items", "Most items"]].map(([k, label]) => (
          <Link key={k} href={`/trips?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`chip ${sort === k ? "chip-active" : ""}`}>
            {label}
          </Link>
        ))}
      </div>

      {!trips?.length ? (
        <Empty>No trips found.</Empty>
      ) : (
        <ul className="list">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips/${t.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-border/40">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.lot_code}</div>
                  <div className="text-xs text-muted">
                    {SOURCE_TYPES[t.type] ?? t.type}
                    {t.date && ` · ${shortDate(t.date)}`} · {t.items} items · {t.sold} sold
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="text-muted">spent {money(t.total_spent)}</div>
                  <div className="font-medium text-ok">{money(t.adjusted_net)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
