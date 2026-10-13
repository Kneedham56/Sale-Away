import "server-only";

export type EbayEnv = "mock" | "sandbox" | "production";

export const SCOPES = {
  base: "https://api.ebay.com/oauth/api_scope",
  identity: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  fulfillmentRead: "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  fulfillment: "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  finances: "https://api.ebay.com/oauth/api_scope/sell.finances",
  accountRead: "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  inventory: "https://api.ebay.com/oauth/api_scope/sell.inventory",
} as const;

/** Read scopes for Phase 3; listing scopes are added only when writing is turned on (Phase 4). */
export function userScopes(write: boolean): string[] {
  const read = [SCOPES.identity, SCOPES.fulfillmentRead, SCOPES.finances, SCOPES.accountRead];
  return write ? [...read, SCOPES.inventory] : read;
}

export function ebayEnv(): EbayEnv {
  const v = (process.env.EBAY_ENV ?? "mock").toLowerCase();
  return v === "production" || v === "sandbox" ? v : "mock";
}

export function hosts(env: Exclude<EbayEnv, "mock">) {
  const sb = env === "sandbox" ? ".sandbox" : "";
  return {
    api: `https://api${sb}.ebay.com`,
    apiz: `https://apiz${sb}.ebay.com`,
    apim: `https://apim${sb}.ebay.com`,
    auth: `https://auth${sb}.ebay.com/oauth2/authorize`,
    token: `https://api${sb}.ebay.com/identity/v1/oauth2/token`,
  };
}

export function credentials(env: Exclude<EbayEnv, "mock">) {
  // Separate keysets per environment; production falls back to the plain names
  const suffix = env === "sandbox" ? "_SANDBOX" : "";
  const clientId = process.env[`EBAY_CLIENT_ID${suffix}`] ?? (env === "production" ? undefined : process.env.EBAY_CLIENT_ID);
  const clientSecret =
    process.env[`EBAY_CLIENT_SECRET${suffix}`] ?? (env === "production" ? undefined : process.env.EBAY_CLIENT_SECRET);
  const ruName = process.env[`EBAY_RU_NAME${suffix}`] ?? (env === "production" ? undefined : process.env.EBAY_RU_NAME);
  return { clientId, clientSecret, ruName };
}

export function hasCredentials(env: EbayEnv): boolean {
  if (env === "mock") return true;
  const c = credentials(env);
  return !!(c.clientId && c.clientSecret);
}

/** Whether listing-creation (Phase 4) is switched on. Off until she has run read-only for a while. */
export function writeEnabled(): boolean {
  return process.env.EBAY_WRITE_ENABLED === "true";
}

export const MARKETPLACE = "EBAY_US";
