import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { signPaths } from "@/lib/photos";
import { todayIso } from "@/lib/dates";
import { FULFILLMENT_LABELS, money, shortDate, STATUS_LABELS, type ItemStatus } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ItemPhotos } from "./item-photos";
import { StatusActions } from "./status-actions";
import { EditItemForm } from "./edit-item-form";
import { deleteItem } from "../actions";
import { ConfirmButton } from "@/components/fields";

export const metadata: Metadata = { title: "Item" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  await requireMember();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: item }, { data: photos }, { data: events }, { data: sales }, lookups, today] = await Promise.all([
    supabase.from("items_view").select("*").eq("id", id).maybeSingle(),
    supabase.from("item_photos").select("id, storage_path, jpeg_path, thumb_path").eq("item_id", id).order("sort_order").order("created_at"),
    supabase.from("item_events").select("id, action, date, note, old_value, new_value").eq("item_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("sales_view").select("id, platform, sold_date, gross, adjusted_net, fulfillment_status").eq("item_id", id).order("sold_date"),
    getLookups(supabase),
    todayIso(),
  ]);
  if (!item) notFound();

  const urls = await signPaths(supabase, (photos ?? []).flatMap((p) => [p.jpeg_path ?? p.storage_path, p.thumb_path]));
  const status = item.status as ItemStatus;
  const backHref = ["listed"].includes(status) ? "/listed" : ["sold", "shipped"].includes(status) ? "/sold" : "/unlisted";
  const actions = ((lookups.settings.item_event_actions as string[] | undefined) ?? [
    "Reduced Price", "Relisted Item", "Revised Listing", "Changed Photos", "Removed Listing",
  ]).map((a) => a.trim());

  const facts: [string, React.ReactNode][] = [
    ["Cost", money(item.cost)],
    ["List price", money(item.list_price)],
    ["Storage", item.storage_location ?? "–"],
    [
      "Trip",
      item.source_id ? (
        <Link key="trip" href={`/trips/${item.source_id}`} className="text-accent">
          {item.lot_code}
        </Link>
      ) : (
        "–"
      ),
    ],
    ["Category", item.format ? `${item.category ?? ""} · ${item.format}` : item.category ?? "–"],
    ["Sourced", shortDate(item.date_sourced)],
    ["Listed", shortDate(item.date_listed)],
    ["Days active", item.days_active ?? "–"],
  ];
  if (item.date_sold) facts.push(["Sold", shortDate(item.date_sold)]);
  if (item.owner) facts.push(["Owner", item.owner]);
  if (item.sku) facts.push(["SKU", item.sku]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={item.title}
        back={{ href: backHref, label: STATUS_LABELS[status === "shipped" ? "sold" : status] }}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={status} /> #{item.item_number}
          </span>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <ItemPhotos
          itemId={item.id}
          photos={(photos ?? []).map((p) => ({
            id: p.id,
            url: urls.get(p.jpeg_path ?? p.storage_path) ?? null,
            thumbUrl: p.thumb_path ? urls.get(p.thumb_path) ?? null : null,
          }))}
        />

        <div className="space-y-5">
          <dl className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="stat-label">{label}</dt>
                <dd className="text-[15px] font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>

          {(item.condition || item.condition_notes || item.notes) && (
            <div className="card space-y-1 p-4 text-sm">
              {item.condition && (
                <p>
                  <span className="text-muted">Condition:</span> {item.condition === "new" ? "New" : "Pre-owned"}
                  {item.condition_grade && `, ${item.condition_grade}`}
                </p>
              )}
              {item.condition_notes && <p className="whitespace-pre-wrap">{item.condition_notes}</p>}
              {item.notes && <p className="whitespace-pre-wrap text-muted">{item.notes}</p>}
            </div>
          )}

          <StatusActions
            item={{ id: item.id, status, list_price: item.list_price, storage_location: item.storage_location }}
            actions={actions}
            storageLocations={lookups.storageLocations}
            today={today}
          />

          {!!sales?.length && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted">Sales</h2>
              <ul className="list">
                {sales.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sales/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        {s.platform} · {shortDate(s.sold_date)} · {FULFILLMENT_LABELS[s.fulfillment_status]}
                      </span>
                      <span className="font-medium">
                        {money(s.gross)} <span className="text-muted">(net {money(s.adjusted_net)})</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer font-medium">Edit details</summary>
        <div className="mt-4">
          <EditItemForm item={item} lookups={lookups} today={today} />
        </div>
      </details>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">History</h2>
        {!events?.length ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="list text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="font-medium">
                    {e.action === "Status Changed"
                      ? `${STATUS_LABELS[e.old_value as ItemStatus] ?? e.old_value} → ${STATUS_LABELS[e.new_value as ItemStatus] ?? e.new_value}`
                      : e.action}
                  </span>
                  {e.action !== "Status Changed" && e.new_value && (
                    <span className="text-muted">
                      {" "}
                      {e.old_value ? `${money(e.old_value)} → ` : ""}
                      {money(e.new_value)}
                    </span>
                  )}
                  {e.note && <span className="text-muted"> · {e.note}</span>}
                </span>
                <span className="shrink-0 text-muted">{shortDate(e.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={deleteItem} className="mt-8 text-center">
        <input type="hidden" name="id" value={item.id} />
        <ConfirmButton message="Delete this item and its photos for good? Sales stay, unlinked.">Delete this item</ConfirmButton>
      </form>
    </div>
  );
}
