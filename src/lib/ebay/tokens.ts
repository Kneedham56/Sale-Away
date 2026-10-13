import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { credentials, hosts, type EbayEnv } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";

type Env = Exclude<EbayEnv, "mock">;
// Cached per business and environment
const userTokens = new Map<string, { token: string; expiresAt: number }>();
const key = (env: Env, ws: string) => `${ws}:${env}`;

function basicAuth(env: Env) {
  const { clientId, clientSecret } = credentials(env);
  if (!clientId || !clientSecret) throw new Error(`eBay ${env} keys are not set.`);
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function tokenRequest(env: Env, params: Record<string, string>) {
  const res = await fetch(hosts(env).token, {
    method: "POST",
    headers: { authorization: basicAuth(env), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`eBay token request failed: ${body?.error_description ?? body?.error ?? res.status}`);
  return body as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
}

/** eBay's consent page URL. `state` ties the callback to this sign-in. */
export function consentUrl(env: Env, scopes: string[], state: string): string {
  const { clientId, ruName } = credentials(env);
  if (!clientId || !ruName) throw new Error(`eBay ${env} client id or RuName is not set.`);
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: ruName, response_type: "code", scope: scopes.join(" "), state });
  return `${hosts(env).auth}?${q}`;
}

/** Trades the authorization code for tokens and stores the refresh token, encrypted. */
export async function exchangeCodeAndStore(env: Env, workspaceId: string, code: string, scopes: string[], connectedBy: string) {
  const { ruName } = credentials(env);
  const t = await tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: ruName! });
  if (!t.refresh_token) throw new Error("eBay didn't return a refresh token.");
  userTokens.set(key(env, workspaceId), { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 });
  const admin = createAdminClient();
  const { error } = await admin.from("ebay_connection").upsert(
    {
      workspace_id: workspaceId,
      environment: env,
      refresh_token_encrypted: encryptSecret(t.refresh_token),
      refresh_token_expires_at: t.refresh_token_expires_in
        ? new Date(Date.now() + t.refresh_token_expires_in * 1000).toISOString()
        : null,
      scopes,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,environment" }
  );
  if (error) throw new Error(error.message);
  return t.access_token;
}

/** A 2-hour access token from her stored refresh token. */
export async function getUserAccessToken(env: Env, workspaceId: string): Promise<string> {
  const cached = userTokens.get(key(env, workspaceId));
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("ebay_connection")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("environment", env)
    .maybeSingle();
  if (!conn) throw new Error(`eBay (${env}) isn't connected. Connect it in Settings.`);
  const t = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: decryptSecret(conn.refresh_token_encrypted),
    scope: (conn.scopes as string[]).join(" "),
  });
  userTokens.set(key(env, workspaceId), { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

export function forgetUserToken(env: Env, workspaceId: string) {
  userTokens.delete(key(env, workspaceId));
}
