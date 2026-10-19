"use client";

import { useState } from "react";
import type { ErrorHelp } from "@/lib/form";

/**
 * A failed action, said plainly: what went wrong, what she can do about it, and a way to send the details to Doc.
 * `context` names the thing she was working on (e.g. "Item #11089 Princess Peach plush").
 */
export function ActionError({ error, help, context }: { error: string; help?: ErrorHelp; context?: string }) {
  const [copied, setCopied] = useState(false);
  const report = [
    "Sale Away problem",
    context,
    `What happened: ${error}`,
    help?.detail && help.detail !== error ? `Details: ${help.detail}` : null,
    `When: ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`,
    typeof location !== "undefined" ? `Page: ${location.pathname}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div role="alert" className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
      <p className="font-medium text-danger">{error}</p>
      <div className="flex flex-wrap gap-2">
        {help?.fix === "reconnect" && (
          <a href="/settings/ebay" className="btn-small border-danger/40">
            Connect eBay
          </a>
        )}
        {help?.fix === "settings" && (
          <a href="/settings/ebay" className="btn-small">
            Open eBay settings
          </a>
        )}
        <a href={`sms:?&body=${encodeURIComponent(report)}`} className="btn-small">
          Text Doc the details
        </a>
        <button
          type="button"
          className="btn-small"
          onClick={() => {
            navigator.clipboard?.writeText(report).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </button>
      </div>
    </div>
  );
}

/** Shown inside a form after an eBay update failed: lets her save the change in Sale Away anyway. */
export function ForceCheckbox({ help, what = "Save it in Sale Away anyway" }: { help?: ErrorHelp; what?: string }) {
  if (!help?.canForce) return null;
  return (
    <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
      <input type="checkbox" name="ebay_skip" className="mt-0.5 h-5 w-5 shrink-0" />
      <span>
        {what}. <span className="text-muted">I&apos;ll fix eBay myself, so the two may not match until I do.</span>
      </span>
    </label>
  );
}
