import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { title: "Mark sold" };

export default async function SellPage({ params }: PageProps<"/items/[id]/sell">) {
  await requireMember();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: item }, lookups, today] = await Promise.all([
    supabase.from("items").select("id, title, cost, list_price").eq("id", id).maybeSingle(),
    getLookups(supabase),
    todayIso(),
  ]);
  if (!item) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Mark sold" subtitle={item.title} back={{ href: `/items/${id}`, label: "Item" }} />
      <SellForm
        itemId={item.id}
        cost={item.cost === null ? null : Number(item.cost)}
        listPrice={item.list_price === null ? null : Number(item.list_price)}
        platforms={lookups.platforms.filter((p) => p.code !== "other").concat(lookups.platforms.filter((p) => p.code === "other"))}
        today={today}
      />
    </div>
  );
}
