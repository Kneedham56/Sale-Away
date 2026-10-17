import "server-only";

export type EbayEnv = "mock" | "sandbox" | "production";

export const SCOPES = {
  base: "https://api.ebay.com/oauth/api_scope",
  identity: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  fulfillmentRead: "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  fulfillment: "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  finances: "https://api.ebay.com/oauth/api_scope/sell.finances",
  accountRead: "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  account: "https://api.ebay.com/oauth/api_scope/sell.account",
  inventory: "https://api.ebay.com/oauth/api_scope/sell.inventory",
} as const;

/** Read scopes for Phase 3; listing scopes are added only when writing is turned on (Phase 4). */
export function userScopes(write: boolean): string[] {
  const read = [SCOPES.identity, SCOPES.fulfillmentRead, SCOPES.finances, SCOPES.accountRead];
  // Writing also needs account management (inventory location, business policies on a fresh test seller)
  return write ? [...read, SCOPES.inventory, SCOPES.account] : read;
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
  // Separate keysets per environment, never mixed: production keys are unknown to the sandbox and vice versa
  const suffix = env === "sandbox" ? "_SANDBOX" : "";
  const get = (name: string) => process.env[`${name}${suffix}`]?.trim() || undefined;
  return { clientId: get("EBAY_CLIENT_ID"), clientSecret: get("EBAY_CLIENT_SECRET"), ruName: get("EBAY_RU_NAME") };
}

export function hasCredentials(env: EbayEnv): boolean {
  if (env === "mock") return true;
  const c = credentials(env);
  return !!(c.clientId && c.clientSecret);
}

/** Keys plus the sign-in link name: everything "Connect eBay" needs. */
export function canConnect(env: EbayEnv): boolean {
  return env !== "mock" && hasCredentials(env) && !!credentials(env).ruName;
}

/** Whether listing-creation (Phase 4) is switched on. Off until she has run read-only for a while. */
export function writeEnabled(): boolean {
  return process.env.EBAY_WRITE_ENABLED === "true";
}

export const MARKETPLACE = "EBAY_US";
