import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { AddItemForm } from "./add-item-form";

export const metadata: Metadata = { title: "Add item" };

export default async function AddItemPage() {
  const me = await requireMember();
  const supabase = await createClient();
  const [lookups, today] = await Promise.all([getLookups(supabase), todayIso()]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add item" subtitle="Lands in Unlisted. Trip and storage spot carry over to the next item." />
      <AddItemForm lookups={lookups} today={today} workspaceId={me.workspace.id} />
    </div>
  );
}
