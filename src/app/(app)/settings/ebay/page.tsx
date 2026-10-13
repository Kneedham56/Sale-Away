import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ebayEnv, hasCredentials, writeEnabled, type EbayEnv } from "@/lib/ebay/config";
import { getEbayClient } from "@/lib/ebay/client";
import type { Policies } from "@/lib/ebay/types";
import { shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/fields";
import { disconnectEbay } from "./actions";
import { EbaySettingsForm, SyncButton } from "./ebay-forms";

export const metadata: Metadata = { title: "eBay" };
export const maxDuration = 300;

const MESSAGES: Record<string, string> = {
  connected: "eBay is connected.",
  declined: "eBay sign-in was cancelled.",
  expired: "That took too long. Try connecting again.",
  "bad-state": "Something didn't match on the way back from eBay. Try again.",
  "missing-keys": "eBay developer keys aren't set on the server yet.",
  failed: "Connecting failed",
};

function expiresWithin30Days(iso: string | null) {
  return !!iso && new Date(iso).getTime() - Date.now() < 30 * 86400_000;
}

export default async function EbaySettingsPage({ searchParams }: PageProps<"/settings/ebay">) {
  const me = await requireMember();
  const sp = await searchParams;
  const env = ebayEnv();
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: connections }, { data: states }, { data: settingRows }] = await Promise.all([
    admin
      .from("ebay_connection")
      .select("environment, ebay_username, connected_at, refresh_token_expires_at, scopes")
      .eq("workspace_id", me.workspace.id),
    supabase.from("ebay_sync_state").select("*"),
    supabase.from("settings").select("key, value").in("key", ["ebay_policies", "ebay_postal_code", "sku_template"]),
  ]);
  const settings = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));
  const conn = (connections ?? []).find((c) => c.environment === env);
  const state = (states ?? []).find((s) => s.environment === env);

  let policies: Policies | null = null;
  let policyError: string | null = null;
  if (env === "mock" || conn) {
    try {
      policies = await getEbayClient(env, me.workspace.id).getPolicies();
    } catch (e) {
      policyError = e instanceof Error ? e.message : String(e);
    }
  }
  const saved = (settings.ebay_policies ?? {}) as Record<string, string>;
  const expiresSoon = expiresWithin30Days(conn?.refresh_token_expires_at ?? null);
  const msg = typeof sp.ebay === "string" ? MESSAGES[sp.ebay] : null;

  const envLabel: Record<EbayEnv, string> = {
    mock: "Mock (sample data, nothing is sent to eBay)",
    sandbox: "Sandbox (eBay's test site, test users only)",
    production: "Production (her real eBay account)",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="eBay" back={{ href: "/settings", label: "Settings" }} subtitle={envLabel[env]} />

      {msg && (
        <p className={`rounded-xl px-4 py-3 text-sm font-medium ${sp.ebay === "connected" ? "bg-ok/15 text-ok" : "bg-coral/15 text-coral"}`}>
          {msg}
          {sp.reason ? `: ${sp.reason}` : ""}
        </p>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Connection</h2>
        {env === "mock" ? (
          <p className="text-sm text-muted">
            Mock mode: the app uses sample orders so everything can be tried safely. Switch EBAY_ENV to sandbox or production on the server
            once eBay keys are approved.
          </p>
        ) : conn ? (
          <div className="space-y-2 text-sm">
            <p>
              Connected as <strong>{conn.ebay_username ?? "eBay seller"}</strong> since {shortDate(conn.connected_at)}.
            </p>
            <p className={expiresSoon ? "font-medium text-coral" : "text-muted"}>
              Access renews automatically until {shortDate(conn.refresh_token_expires_at)}.
              {expiresSoon && " Reconnect soon to keep orders flowing."}
            </p>
            <p className="text-xs text-muted">Permissions: {(conn.scopes as string[]).map((s) => s.split("/").pop()).join(", ")}</p>
            <div className="flex gap-2">
              <a href={`/api/ebay/connect?env=${env}`} className="btn-small">
                Reconnect
              </a>
              <form action={disconnectEbay}>
                <input type="hidden" name="environment" value={env} />
                <SubmitButton className="btn-small text-danger" pendingText="…">
                  Disconnect
                </SubmitButton>
              </form>
            </div>
            <p className="text-xs text-muted">She can also revoke access any time in her eBay account settings.</p>
          </div>
        ) : hasCredentials(env) ? (
          <div className="space-y-2 text-sm">
            <p>She signs in on eBay&apos;s own page and approves. The app never sees her eBay password.</p>
            <a href={`/api/ebay/connect?env=${env}`} className="btn-primary w-full">
              Connect eBay
            </a>
          </div>
        ) : (
          <p className="text-sm text-coral">eBay {env} keys are not set on the server yet.</p>
        )}
      </section>

      {(env === "mock" || conn) && (
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Orders and fees</h2>
          {state?.last_run_at && (
            <p className="text-sm text-muted">
              Last sync {new Date(state.last_run_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
              {state.last_error && <span className="text-danger"> · failed: {state.last_error}</span>}
            </p>
          )}
          <SyncButton env={env} />
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Listing defaults</h2>
        <p className="text-sm text-muted">
          Publishing from the app is {env === "mock" ? "preview-only in mock mode" : writeEnabled() ? "on" : "off (EBAY_WRITE_ENABLED)"}. Best Offer is
          always on; buyer pays shipping through her policies.
        </p>
        {policyError && <p className="text-sm text-danger">Couldn&apos;t load policies: {policyError}</p>}
        <EbaySettingsForm
          policies={policies}
          values={{
            fulfillment: saved.fulfillment,
            fulfillment_media: saved.fulfillment_media,
            payment: saved.payment,
            return: saved.return,
            zip: typeof settings.ebay_postal_code === "string" ? settings.ebay_postal_code : "",
            sku: typeof settings.sku_template === "string" ? settings.sku_template : "{cost}-{lot}-{listed}-{n}",
          }}
        />
      </section>

      <section className="card space-y-1 p-4 text-sm">
        <h2 className="font-semibold">Account deletion notices</h2>
        <p className="text-muted">
          eBay endpoint: <code className="break-all">/api/ebay/account-deletion</code> · verification token{" "}
          {process.env.EBAY_VERIFICATION_TOKEN ? "set" : <span className="text-coral">not set</span>}
        </p>
        <p className="text-muted">
          <Link href="/activity" className="text-accent">
            Activity log
          </Link>{" "}
          lists every change the app makes on eBay.
        </p>
      </section>
    </div>
  );
}
