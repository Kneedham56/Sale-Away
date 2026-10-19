"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { changeStatus, logItemEvent } from "../actions";
import { Field, MoneyInput, SubmitButton } from "@/components/fields";
import { EXIT_LABELS, type ItemStatus } from "@/lib/format";
import { ActionError, ForceCheckbox } from "@/components/action-error";

type Panel = null | "list" | "log" | "exit";

export function StatusActions({
  item,
  actions,
  storageLocations,
  today,
  listedViaEbay = false,
}: {
  item: { id: string; item_number: number; title: string; status: ItemStatus; list_price: number | null; storage_location: string | null };
  actions: string[];
  storageLocations: string[];
  today: string;
  /** When eBay publishing is available, manual "Mark listed" becomes a secondary option */
  listedViaEbay?: boolean;
}) {
  const [opened, setOpened] = useState<{ panel: Panel; at: unknown[] }>({ panel: null, at: [] });
  const [exitTo, setExitTo] = useState<ItemStatus>("discarded");
  const [statusState, statusAction] = useActionState(changeStatus, null);
  const [logState, logAction] = useActionState(logItemEvent, null);
  // A panel closes itself once its save succeeds (a new ok result arrives after it was opened)
  const savedSinceOpen =
    (statusState !== opened.at[0] && statusState?.ok) || (logState !== opened.at[1] && logState?.ok);
  const panel = savedSinceOpen ? null : opened.panel;
  const [logChoice, setLogChoice] = useState(actions[0] ?? "Reduced Price");
  const context = `Item #${item.item_number}: ${item.title}`;
  const statusHelp = statusState && !statusState.ok ? statusState.help : undefined;
  const logHelp = logState && !logState.ok ? logState.help : undefined;

  const isActive = ["intake", "unlisted", "ready_to_list"].includes(item.status);
  const isListed = item.status === "listed";
  const isExited = ["donated", "damaged", "kept", "discarded"].includes(item.status);

  function toggle(p: Panel) {
    setOpened({ panel: panel === p ? null : p, at: [statusState, logState] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(isActive || isListed) && (
          <Link href={`/items/${item.id}/sell`} className="btn-primary min-h-11 px-4">
            Mark sold
          </Link>
        )}
        {isActive && (
          <button className={listedViaEbay ? "btn-small min-h-11" : "btn-secondary min-h-11 px-4"} onClick={() => toggle("list")}>
            {listedViaEbay ? "I listed it on eBay myself" : "Mark listed"}
          </button>
        )}
        {isListed && (
          <button className="btn-secondary min-h-11 px-4" onClick={() => toggle("log")}>
            Price drop / relist…
          </button>
        )}
        {(isActive || isListed) && (
          <button className="btn-small min-h-11" onClick={() => toggle("exit")}>
            {isListed ? "Take it down…" : "Donate / give up…"}
          </button>
        )}
        {(isExited || isListed || item.status === "ready_to_list") && (
          <form action={statusAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="status" value="unlisted" />
            <SubmitButton className="btn-small min-h-11" pendingText="…">
              Back to unlisted
            </SubmitButton>
          </form>
        )}
      </div>

      {panel === "list" && (
        <form action={statusAction} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="status" value="listed" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="List price">
              <MoneyInput name="list_price" defaultValue={item.list_price ?? ""} />
            </Field>
            <Field label="Date listed">
              <input type="date" name="date_listed" className="input" defaultValue={today} />
            </Field>
          </div>
          <Field label="Storage spot">
            <input name="storage_location" className="input" list="storage-locations" defaultValue={item.storage_location ?? ""} />
          </Field>
          {listedViaEbay && (
            <Field label="eBay item number" hint="The long number in the listing's web address, so sales and changes stay matched.">
              <input name="ebay_item_id" className="input" inputMode="numeric" placeholder="e.g. 205612345678" />
            </Field>
          )}
          <datalist id="storage-locations">
            {storageLocations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          {listedViaEbay && (
            <p className="text-xs text-muted">This only updates Sale Away. To post it from here, use List on eBay instead.</p>
          )}
          <SubmitButton>Mark listed</SubmitButton>
        </form>
      )}

      {panel === "log" && (
        <form action={logAction} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={item.id} />
          <Field label="What did you do?">
            <select name="action" className="input" value={logChoice} onChange={(e) => setLogChoice(e.target.value)}>
              {actions.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          {/price/i.test(logChoice) && (
            <Field label="New price">
              <MoneyInput name="new_price" defaultValue={item.list_price ?? ""} />
            </Field>
          )}
          {/^removed/i.test(logChoice) && <p className="text-xs text-muted">The item goes back to Unlisted.</p>}
          <Field label="Note (optional)">
            <input name="note" className="input" />
          </Field>
          {logState && !logState.ok && <ActionError error={logState.error} help={logHelp} context={context} />}
          <ForceCheckbox help={logHelp} />
          <SubmitButton>Save</SubmitButton>
        </form>
      )}

      {panel === "exit" && (
        <form action={statusAction} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={item.id} />
          <p className="text-sm text-muted">Where did it go? It moves to Completed{isListed ? " and comes off eBay" : ""}.</p>
          <div className="flex flex-wrap gap-2">
            {(["discarded", "donated", "damaged", "kept"] as const).map((s) => (
              <label key={s} className={`chip cursor-pointer ${exitTo === s ? "chip-active" : ""}`}>
                <input type="radio" name="status" value={s} className="sr-only" checked={exitTo === s} onChange={() => setExitTo(s)} />
                {EXIT_LABELS[s]}
              </label>
            ))}
          </div>
          {exitTo === "damaged" && <p className="text-xs text-muted">Its cost is recorded as a write-off for taxes.</p>}
          <Field label="Note (optional)">
            <input name="note" className="input" />
          </Field>
          {statusState && !statusState.ok && <ActionError error={statusState.error} help={statusHelp} context={context} />}
          <ForceCheckbox help={statusHelp} />
          <SubmitButton>Save</SubmitButton>
        </form>
      )}

      {panel !== "exit" && statusState && !statusState.ok && (
        <>
          <ActionError error={statusState.error} help={statusHelp} context={context} />
          {statusHelp?.canForce && isListed && (
            <form action={statusAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="status" value="unlisted" />
              <input type="hidden" name="ebay_skip" value="on" />
              <SubmitButton className="btn-small min-h-11" pendingText="…">
                Back to unlisted anyway (I&apos;ll end it on eBay myself)
              </SubmitButton>
            </form>
          )}
        </>
      )}
      {statusState?.ok && statusState.data && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{statusState.data}</p>}
      {logState?.ok && logState.data && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">{logState.data}</p>}
    </div>
  );
}
