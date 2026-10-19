import { FormError } from "@/lib/form";
import { EbayError } from "./client";

/**
 * Turns whatever eBay (or the sign-in) threw into a plain-language message that says what happened,
 * that nothing was changed, and what she can do about it. `doing` reads like "post this item".
 */
export function ebayProblem(e: unknown, doing: string, opts: { canForce?: boolean } = {}): FormError {
  if (e instanceof FormError) return e;
  const detail = e instanceof Error ? e.message : String(e);
  const status = e instanceof EbayError ? e.status : 0;
  const help = (fix: "reconnect" | "settings" | "edit" | "retry" | "doc") => ({ fix, detail, canForce: opts.canForce });

  if (
    /isn't connected|token request failed|invalid_grant|refresh token|invalid access token|insufficient permissions|expired|scope/i.test(detail) ||
    status === 401 ||
    status === 403 ||
    // Trading API: auth token invalid / hard expired / not authorized
    [931, 932, 16110, 21916984].includes(status)
  ) {
    return new FormError(
      `Sale Away isn't signed in to your eBay right now, so it couldn't ${doing}. Nothing was changed. Tap Connect eBay, sign in, then try again.`,
      help("reconnect")
    );
  }
  if (/ZIP code/i.test(detail)) return new FormError(`${detail} (Settings → eBay)`, help("settings"));
  if (/payment policy|Settings → eBay/i.test(detail)) return new FormError(detail, help("settings"));
  if (/^Not ready:|calculated shipping|No photos|category/i.test(detail)) return new FormError(detail.replace(/^Not ready:\s*/, "Not ready yet: "), help("edit"));
  if (status >= 500 || /system error|fetch failed|timed? ?out|ECONN|network|socket/i.test(detail)) {
    return new FormError(`eBay had a hiccup and couldn't ${doing}. Nothing was changed. Wait a minute and try again.`, help("retry"));
  }
  if (e instanceof EbayError || /^eBay/.test(detail)) {
    return new FormError(`eBay wouldn't ${doing}: ${detail.replace(/^eBay( listings)?:\s*/, "")}`, help("edit"));
  }
  return new FormError(`Something went wrong trying to ${doing}. Nothing was changed.`, help("doc"));
}
