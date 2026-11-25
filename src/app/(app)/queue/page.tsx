import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayModeFor } from "@/lib/ebay/mode";
import { getLookups, settingNumber } from "@/lib/data/lookups";
import { signPaths } from "@/lib/photos";
import { BATCH_TITLE } from "@/lib/queue";
import type { ListingSuggestion } from "@/lib/ai/types";
import { PageHeader } from "@/components/page-header";
import { PhotoBatch } from "./photo-batch";
import { QueueList, type QueueRow } from "./queue-list";

export const metadata: Metadata = { title: "Listing queue" };
export const maxDuration = 300;

/**
 * Photos in, listings out: she drops in a batch of photos, the app makes one item per item photographed and writes
 * each listing. Cheap items get a quick check and one tap to post; pricier or unusual ones get her full review.
 */
export default async function QueuePage() {
  const me = await requireMember();
  const supabase = await createClient();
  const lookups = await getLookups(supabase);
  const quickMax = settingNumber(lookups.settings, "queue_quick_max", 20);

  const mode = await ebayModeFor(me.workspace.id);
  const { data: conn } =
    mode.env === "mock"
      ? { data: true }
      : await createAdminClient().from("ebay_connection").select("environment").eq("workspace_id", me.workspace.id).eq("environment", mode.env).maybeSingle();
  const canPost = mode.canPublish && !!conn;

  // Waiting items: from a photo batch (no name yet), or with an AI listing she hasn't accepted
  const { data: items } = await supabase
    .from("items_view")
    .select("id, title, thumb_path, created_at")
    .in("status", ["intake", "unlisted"])
    .gt("photo_count", 0)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (items ?? []).map((i) => i.id);
  const { data: runs } = ids.length
    ? await supabase
        .from("ai_runs")
        .select("id, item_id, output, accepted, created_at")
        .in("item_id", ids)
        .eq("mode", "listing")
        .not("output", "is", null)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, { id: string; output: ListingSuggestion; accepted: boolean | null }>();
  for (const r of runs ?? []) if (!latest.has(r.item_id)) latest.set(r.item_id, r as never);

  const waiting = (items ?? []).filter((i) => i.title === BATCH_TITLE || (latest.has(i.id) && !latest.get(i.id)!.accepted));
  const urls = await signPaths(supabase, waiting.map((i) => i.thumb_path));
  const rows: QueueRow[] = waiting.map((i) => {
    const run = latest.get(i.id);
    return {
      id: i.id,
      title: i.title,
      fromBatch: i.title === BATCH_TITLE,
      thumbUrl: i.thumb_path ? urls.get(i.thumb_path) ?? null : null,
      run: run && !run.accepted ? { runId: run.id, suggestion: run.output } : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Listing queue"
        back={{ href: "/unlisted", label: "Inventory" }}
        subtitle="Add a batch of photos. Sale Away makes an item for each thing you photographed and writes its listing."
      />
      <div className="space-y-6">
        <PhotoBatch
          workspaceId={me.workspace.id}
          geminiAvailable={!!process.env.GEMINI_API_KEY}
          sources={lookups.sources.slice(0, 30)}
          storageLocations={lookups.storageLocations}
        />
        <QueueList rows={rows} quickMax={quickMax} canPost={canPost} env={mode.env} geminiAvailable={!!process.env.GEMINI_API_KEY} />
      </div>
    </>
  );
}
