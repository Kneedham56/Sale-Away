"use client";

import { useActionState } from "react";
import { saveCleanupAnswers } from "./actions";
import { SubmitButton } from "@/components/fields";

type Q =
  | { key: string; text: string; hint?: string; choices: string[]; other?: boolean }
  | { key: string; text: string; hint?: string; free: true };

const QUESTIONS: Q[] = [
  {
    key: "q_labels",
    text: "Where do you buy most of your shipping labels?",
    choices: ["On eBay, when I print the order", "Pirate Ship", "USPS.com", "At the post office counter"],
    other: true,
  },
  {
    key: "q_label_pay",
    text: "When you buy a label on eBay, how do you pay for it?",
    choices: ["It comes out of my eBay earnings", "My credit or debit card", "PayPal", "Not sure"],
  },
  {
    key: "q_gross",
    text: "In your monthly tabs, the “Gross Sale” number for an eBay sale is…",
    choices: ["Just the item's price", "The item's price plus what the buyer paid for shipping", "Not sure"],
  },
  {
    key: "q_store_fee",
    text: "eBay charges you $21.95 a month for your eBay Store. Should Sale Away add that to your expenses automatically each month?",
    choices: ["Yes, add it", "No, I already write it down", "Not sure"],
  },
  { key: "q_sku", text: "What do you type in eBay's “Custom label (SKU)” box? Give one real example.", hint: "e.g. 2.50 GS4 10/26", free: true },
  {
    key: "q_storage",
    text: "Your storage spots with numbers, like 000082: what are those?",
    choices: ["Numbered bins or totes", "Numbered bags", "Shelves", "A mix"],
    other: true,
  },
  {
    key: "q_bundles",
    text: "Book bundles (like “4 Goosebumps books”): do you sell them together as one listing, or split them up?",
    choices: ["Together as one", "Split them up", "Depends"],
  },
  { key: "q_tiffany", text: "The Tiffany items: are you selling them for Tiffany? If so, how do you split the money?", free: true },
  {
    key: "q_flyp_export",
    text: "In FLYP, is there a way to download a list of your sales (like an Excel file)?",
    choices: ["Yes", "No", "Not sure"],
  },
  { key: "q_notes", text: "Anything confusing so far, or anything you wish Sale Away did?", free: true },
];

export function QuestionsForm({ answers }: { answers: Record<string, string> }) {
  const [state, action] = useActionState(saveCleanupAnswers, null);
  return (
    <form action={action} className="space-y-5">
      {QUESTIONS.map((q, n) => (
        <fieldset key={q.key} className="card space-y-2 p-4">
          <legend className="sr-only">{q.text}</legend>
          <p className="font-medium">
            {n + 1}. {q.text}
          </p>
          {"free" in q ? (
            <textarea name={q.key} className="input min-h-16" defaultValue={answers[q.key] ?? ""} placeholder={q.hint} />
          ) : (
            <div className="space-y-1.5">
              {q.choices.map((c) => (
                <label key={c} className="flex items-center gap-3 text-[15px]">
                  <input type="radio" name={q.key} value={c} defaultChecked={answers[q.key] === c} className="h-5 w-5" />
                  {c}
                </label>
              ))}
              {q.other && (
                <input
                  name={`${q.key}_other`}
                  className="input"
                  placeholder="Something else? Type it here"
                  defaultValue={answers[`${q.key}_other`] ?? ""}
                />
              )}
            </div>
          )}
        </fieldset>
      ))}
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm font-medium text-ok">Saved, thank you! You can change answers any time.</p>}
      <SubmitButton>Save my answers</SubmitButton>
    </form>
  );
}
