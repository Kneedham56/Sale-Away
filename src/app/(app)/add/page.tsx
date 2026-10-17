import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { AddItemForm } from "./add-item-form";

export const metadata: Metadata = { title: "Add item" };

export default async function AddItemPage({ searchParams }: PageProps<"/add">) {
  const me = await requireMember();
  const supabase = await createClient();
  const [lookups, today] = await Promise.all([getLookups(supabase), todayIso()]);
  const trip = (await searchParams).trip;
  const tripId = typeof trip === "string" ? trip : null;
  const tripName = tripId ? lookups.sources.find((s) => s.id === tripId)?.lot_code : null;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Add item"
        subtitle={tripName ? `Adding to trip ${tripName}. Trip and storage spot carry over to the next item.` : "Lands in Inventory. Trip and storage spot carry over to the next item."}
        back={tripId ? { href: `/trips/${tripId}`, label: "Trip" } : undefined}
      />
      <AddItemForm lookups={lookups} today={today} workspaceId={me.workspace.id} tripId={tripId} />
    </div>
  );
}
