import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups, settingNumber } from "@/lib/data/lookups";
import { PageHeader } from "@/components/page-header";
import { AiSettingsForm, LookupTools, RatesForm } from "./settings-forms";
import { DEFAULT_LISTING_PROMPT, DEFAULT_QUICK_PROMPT, DEFAULT_STORE_RULES } from "@/lib/ai/prompts";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireMember();
  const supabase = await createClient();
  const [lookups, { data: members }] = await Promise.all([
    getLookups(supabase),
    supabase.from("members").select("email, display_name, role").order("created_at"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" actions={<Link href="/settings/ebay" className="btn-small">eBay ›</Link>} />

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Fees and rates</h2>
        <RatesForm
          platforms={lookups.platforms}
          mileageRate={settingNumber(lookups.settings, "mileage_rate", 0.725)}
          staleDays={settingNumber(lookups.settings, "stale_listing_days", 90)}
        />
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Storage spots</h2>
        <p className="mb-3 text-sm text-muted">
          {lookups.storageLocations.length.toLocaleString()} spots. Rename one (e.g. “000082” → “Bin 82”) or merge two by renaming one into
          the other; every item moves with it.
        </p>
        <LookupTools kind="storage" label="storage spot" options={lookups.storageLocations} />
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Categories</h2>
        <p className="mb-3 text-sm text-muted">{lookups.categories.length} categories. Merge duplicates like “Toys” into “Toys & Games”.</p>
        <LookupTools kind="category" label="category" options={lookups.categories} />
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold">AI listing assistant</h2>
        <p className="mb-3 text-sm text-muted">
          {process.env.GEMINI_API_KEY ? "Gemini key is set on the server." : "No Gemini key on the server: Copy prompt mode only."} Every
          run is logged with its token use.
        </p>
        <AiSettingsForm
          values={Object.fromEntries(
            ["ai_listing_prompt", "ai_quick_prompt", "store_rules", "description_template", "ai_listing_model", "ai_quick_model"].map((k) => [
              k,
              typeof lookups.settings[k] === "string" ? (lookups.settings[k] as string) : "",
            ])
          )}
          defaults={{
            ai_listing_prompt: DEFAULT_LISTING_PROMPT,
            ai_quick_prompt: DEFAULT_QUICK_PROMPT,
            store_rules: DEFAULT_STORE_RULES,
            ai_listing_model: "gemini-flash-latest",
            ai_quick_model: "gemini-flash-lite-latest",
          }}
        />
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">People</h2>
        <ul className="space-y-1 text-sm">
          {(members ?? []).map((m) => (
            <li key={m.email}>
              {m.display_name} <span className="text-muted">· {m.email} · {m.role}</span>
              {m.email === me.email && <span className="text-muted"> (you)</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
