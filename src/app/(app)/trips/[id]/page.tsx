import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { signPaths } from "@/lib/photos";
import { money, shortDate, SOURCE_TYPES, STATUS_LABELS, type ItemStatus } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Empty, ItemRow } from "@/components/item-row";
import { ConfirmButton } from "@/components/fields";
import { EditTripForm } from "../trip-forms";
import { deleteTrip } from "../actions";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  await requireMember();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: trip }, { data: items }, today] = await Promise.all([
    supabase.from("source_report").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("items_view")
      .select("id, title, status, cost, list_price, thumb_path, storage_location")
      .eq("source_id", id)
      .order("status")
      .order("title")
      .limit(500),
    todayIso(),
  ]);
  if (!trip) notFound();
  const urls = await signPaths(supabase, (items ?? []).map((i) => i.thumb_path));
  const spent = trip.total_spent === null ? null : Number(trip.total_spent);
  const tiles: [string, string][] = [
    ["Spent", money(spent)],
    ["Items", String(trip.items)],
    ["Unlisted", String(trip.unlisted)],
    ["Listed", String(trip.listed)],
    ["Sold", String(trip.sold)],
    ["Gross sales", money(trip.gross)],
    ["Profit so far", money(trip.adjusted_net)],
    ["Item cost total", money(trip.item_cost)],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={trip.lot_code}
        back={{ href: "/trips", label: "Trips" }}
        subtitle={`${SOURCE_TYPES[trip.type] ?? trip.type}${trip.date ? ` · ${shortDate(trip.date)}` : ""}${trip.place ? ` · ${trip.place}` : ""}`}
      />
      <Link href={`/add?trip=${trip.id}`} className="btn-primary mb-4 w-full bg-coral">
        + Add items from this trip
      </Link>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <p className="mb-6 text-xs text-muted">
        Profit so far = sales after shipping, fees and each sold item&apos;s cost. Compare it with what the trip cost.
      </p>

      <h2 className="mb-2 text-sm font-semibold text-muted">Items from this trip</h2>
      {!items?.length ? (
        <Empty>No items linked to this trip.</Empty>
      ) : (
        <ul className="list mb-6">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              href={`/items/${it.id}`}
              thumbUrl={it.thumb_path ? urls.get(it.thumb_path) : null}
              title={it.title}
              meta={[STATUS_LABELS[it.status as ItemStatus], it.storage_location].filter(Boolean).join(" · ")}
              right={<span className="text-muted">{money(it.cost)}</span>}
            />
          ))}
        </ul>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer font-medium">Edit trip</summary>
        <div className="mt-4">
          <EditTripForm trip={trip} today={today} />
        </div>
      </details>
      {!trip.items && (
        <form action={deleteTrip} className="mt-6 text-center">
          <input type="hidden" name="id" value={trip.id} />
          <ConfirmButton message="Delete this trip?">Delete this trip</ConfirmButton>
        </form>
      )}
      {!!trip.items && (
        <p className="mt-4 text-center text-xs text-muted">
          <Link href={`/unlisted?trip=${encodeURIComponent(trip.lot_code)}`} className="underline">
            See unlisted items from this trip
          </Link>
        </p>
      )}
    </div>
  );
}
