import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/photos";
import { todayIso } from "@/lib/dates";
import { FULFILLMENT_LABELS, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty, Thumb } from "@/components/item-row";
import { SubmitButton } from "@/components/fields";
import { setFulfillment } from "../sales/actions";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Outgoing" };

export default async function OutgoingPage({ searchParams }: PageProps<"/outgoing">) {
  await requireMember();
  const sp = await searchParams;
  const byShipBy = sp.sort === "ship_by";
  const supabase = await createClient();
  const today = await todayIso();

  let q = supabase
    .from("sales_view")
    .select("id, title, platform, sold_date, ship_by, buyer_name, storage_location, fulfillment_status, item_id")
    .in("fulfillment_status", ["to_ship", "packed"]);
  q = byShipBy
    ? q.order("ship_by", { ascending: true, nullsFirst: false }).order("sold_date")
    : q.order("storage_location", { ascending: true, nullsFirst: false }).order("sold_date");
  const { data: orders } = await q;

  const itemIds = (orders ?? []).map((o) => o.item_id).filter(Boolean) as string[];
  const { data: thumbs } = itemIds.length
    ? await supabase.from("items_view").select("id, thumb_path").in("id", itemIds)
    : { data: [] };
  const thumbByItem = new Map((thumbs ?? []).map((t) => [t.id, t.thumb_path]));
  const urls = await signPaths(supabase, [...thumbByItem.values()]);

  return (
    <>
      <PageHeader
        title="Outgoing"
        subtitle={byShipBy ? "Oldest ship-by first." : "Pick list: sorted by storage spot so you walk the garage once."}
        actions={<PrintButton />}
      />
      <div className="mb-3 flex gap-2 print:hidden">
        <Link href="/outgoing" className={`chip ${!byShipBy ? "chip-active" : ""}`}>By storage spot</Link>
        <Link href="/outgoing?sort=ship_by" className={`chip ${byShipBy ? "chip-active" : ""}`}>By ship-by date</Link>
      </div>

      {!orders?.length ? (
        <Empty>Nothing to ship. Nice.</Empty>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const late = o.ship_by && o.ship_by < today;
            const thumb = o.item_id ? thumbByItem.get(o.item_id) : null;
            return (
              <li key={o.id} className="card flex gap-3 p-3 break-inside-avoid">
                <Thumb url={thumb ? urls.get(thumb) : null} className="h-20 w-20" />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">📦 {o.storage_location ?? "No storage spot"}</div>
                  <Link href={`/sales/${o.id}`} className="line-clamp-2 text-sm leading-snug">{o.title}</Link>
                  <div className="mt-1 text-xs text-muted">
                    {o.platform} · sold {shortDate(o.sold_date)}
                    {o.ship_by && (
                      <span className={late ? "font-semibold text-danger" : ""}> · ship by {shortDate(o.ship_by)}</span>
                    )}
                    {o.buyer_name && ` · ${o.buyer_name}`}
                  </div>
                  <div className="mt-2 flex gap-2 print:hidden">
                    {o.fulfillment_status === "to_ship" ? (
                      <form action={setFulfillment}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value="packed" />
                        <SubmitButton className="btn-small" pendingText="…">Packed</SubmitButton>
                      </form>
                    ) : (
                      <span className="chip chip-active">{FULFILLMENT_LABELS.packed}</span>
                    )}
                    <form action={setFulfillment}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="shipped" />
                      <SubmitButton className="btn-small" pendingText="…">Shipped</SubmitButton>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
