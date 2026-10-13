"use client";

import Link from "next/link";
import { useState } from "react";
import { generateListing } from "../items/ai-actions";
import { Thumb } from "@/components/item-row";

type Row = { id: string; title: string; thumbUrl: string | null };
type Status = { state: "queued" | "working" | "done" | "error"; note?: string };

export function BatchGenerate({ items, geminiAvailable }: { items: Row[]; geminiAvailable: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function runAll() {
    const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    setRunning(true);
    setStatus(Object.fromEntries(ids.map((id) => [id, { state: "queued" } as Status])));
    // One at a time: the free Gemini tier has a low per-minute limit
    for (const id of ids) {
      setStatus((s) => ({ ...s, [id]: { state: "working" } }));
      const res = await generateListing(id, null);
      setStatus((s) => ({
        ...s,
        [id]: res.ok
          ? { state: "done", note: `${res.data!.suggestion.decision} · $${res.data!.suggestion.price ?? "?"}` }
          : { state: "error", note: res.error },
      }));
      if (!res.ok && /busy|quota/i.test(res.error)) await new Promise((r) => setTimeout(r, 30_000));
    }
    setRunning(false);
  }

  if (!geminiAvailable) {
    return <p className="card p-4 text-sm text-muted">Batch needs the Gemini key on the server. Use Copy prompt on each item instead.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-small" onClick={() => setSelected(new Set(items.slice(0, 10).map((i) => i.id)))}>
          Select newest 10
        </button>
        <button type="button" className="btn-small" onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <span className="text-sm text-muted">{selected.size} selected</span>
      </div>
      <ul className="list">
        {items.map((it) => {
          const st = status[it.id];
          return (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2">
              <input type="checkbox" className="h-5 w-5" checked={selected.has(it.id)} disabled={running} onChange={() => toggle(it.id)} />
              <Thumb url={it.thumbUrl} className="h-12 w-12" />
              <Link href={`/items/${it.id}`} className="min-w-0 flex-1 truncate text-sm">
                {it.title}
              </Link>
              {st && (
                <span
                  className={`shrink-0 text-xs ${st.state === "error" ? "text-danger" : st.state === "done" ? "text-ok" : "text-muted"}`}
                  title={st.note}
                >
                  {st.state === "working" ? "Working…" : st.state === "queued" ? "Queued" : st.state === "done" ? st.note : "Failed"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:static">
        <button type="button" className="btn-primary w-full" disabled={running || !selected.size} onClick={runAll}>
          {running ? "Generating… keep this screen open" : `Generate ${selected.size || ""} listing${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>
      {Object.values(status).some((s) => s.state === "done") && !running && (
        <p className="text-sm text-muted">Done. Open each item to review its suggestion and tap Accept.</p>
      )}
    </div>
  );
}
