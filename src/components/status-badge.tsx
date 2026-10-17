import { STATUS_LABELS, type ItemStatus } from "@/lib/format";

const TONES: Record<ItemStatus, string> = {
  intake: "bg-border text-fg",
  unlisted: "bg-border text-fg",
  ready_to_list: "bg-accent/15 text-accent",
  listed: "bg-accent/15 text-accent",
  sold: "bg-ok/15 text-ok",
  shipped: "bg-ok/15 text-ok",
  donated: "bg-border text-muted",
  damaged: "bg-danger/15 text-danger",
  kept: "bg-border text-muted",
  discarded: "bg-border text-muted",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
