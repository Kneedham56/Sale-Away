import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/photos";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/item-row";
import { BatchGenerate } from "./batch-generate";

export const metadata: Metadata = { title: "Batch generate" };
export const maxDuration = 300;

export default async function BatchPage() {
  await requireMember();
  const supabase = await createClient();
  // Unlisted items that have photos: the ones the AI can actually help with
  const { data: items } = await supabase
    .from("items_view")
    .select("id, title, thumb_path, photo_count, created_at")
    .in("status", ["intake", "unlisted"])
    .gt("photo_count", 0)
    .order("created_at", { ascending: false })
    .limit(100);
  const urls = await signPaths(supabase, (items ?? []).map((i) => i.thumb_path));

  return (
    <>
      <PageHeader
        title="Batch generate"
        back={{ href: "/ready", label: "Ready to list" }}
        subtitle="Pick unlisted items with photos. Suggestions are saved on each item for you to review and accept."
      />
      {!items?.length ? (
        <Empty>No unlisted items with photos yet. Add photos when you add items.</Empty>
      ) : (
        <BatchGenerate
          items={items.map((i) => ({ id: i.id, title: i.title, thumbUrl: i.thumb_path ? urls.get(i.thumb_path) ?? null : null }))}
          geminiAvailable={!!process.env.GEMINI_API_KEY}
        />
      )}
    </>
  );
}
