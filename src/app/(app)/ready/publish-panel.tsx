"use client";

import { useState } from "react";
import { publishToEbay } from "../settings/ebay/actions";

type Row = { id: string; title: string };
type Status = { state: "queued" | "working" | "done" | "error"; note?: string; url?: string | null };

/** Bulk publish from Ready to List (replaces Seller Hub's bulk edit page). One at a time, with progress. */
export function PublishPanel({ items, env }: { items: Row[]; env: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  async function run() {
    const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    if (env === "production" && !confirm(`Publish ${ids.length} listing${ids.length === 1 ? "" : "s"} live on eBay?`)) return;
    setRunning(true);
    setStatus(Object.fromEntries(ids.map((id) => [id, { state: "queued" } as Status])));
    for (const id of ids) {
      setStatus((s) => ({ ...s, [id]: { state: "working" } }));
      const r = await publishToEbay(id);
      setStatus((s) => ({
        ...s,
        [id]: r.ok
          ? { state: "done", note: r.data!.dryRun ? `preview OK · SKU ${r.data!.sku}` : `live · ${r.data!.listingId}`, url: r.data!.url }
          : { state: "error", note: r.error },
      }));
    }
    setRunning(false);
  }

  return (
    <div className="card mb-4 p-4">
      <button type="button" className="flex w-full items-center justify-between font-semibold" onClick={() => setOpen(!open)}>
        <span>Publish to eBay {env !== "production" && <span className="text-xs font-normal text-muted">({env})</span>}</span>
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {env === "mock" && <p className="text-xs text-muted">Mock mode: checks each listing and shows what would be sent. Nothing goes to eBay.</p>}
          {env === "sandbox" && <p className="text-xs text-muted">Sandbox: publishes to eBay&apos;s test site. Her items here are not changed.</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-small" onClick={() => setSelected(new Set(items.map((i) => i.id)))} disabled={running}>
              Select all
            </button>
            <button type="button" className="btn-small" onClick={() => setSelected(new Set())} disabled={running}>
              Clear
            </button>
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {items.map((it) => {
              const st = status[it.id];
              return (
                <li key={it.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    checked={selected.has(it.id)}
                    disabled={running}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(it.id)) n.delete(it.id);
                        else n.add(it.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1">{it.title}</span>
                    {st && (
                      <span className={`block text-xs ${st.state === "error" ? "text-danger" : st.state === "done" ? "text-ok" : "text-muted"}`}>
                        {st.state === "working" ? "Publishing…" : st.state === "queued" ? "Queued" : st.note}
                        {st.url && (
                          <>
                            {" "}
                            <a href={st.url} target="_blank" rel="noreferrer" className="underline">
                              view ↗
                            </a>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn-primary w-full" disabled={running || !selected.size} onClick={run}>
            {running ? "Publishing… keep this screen open" : `${env === "mock" ? "Check" : "Publish"} ${selected.size} selected`}
          </button>
        </div>
      )}
    </div>
  );
}
