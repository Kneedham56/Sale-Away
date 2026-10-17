import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentMember } from "@/lib/auth";
import { canConnect, userScopes } from "@/lib/ebay/config";
import { ebayModeFor } from "@/lib/ebay/mode";
import { consentUrl } from "@/lib/ebay/tokens";

// Sends her to eBay's own sign-in page. She approves there; the app never sees her eBay password.
export async function GET(request: NextRequest) {
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL("/login", request.url));
  // The business decides which eBay it connects to (sandbox for the test shop, production for real)
  const mode = await ebayModeFor(member.workspace.id);
  if (mode.env === "mock") return NextResponse.redirect(new URL("/settings/ebay?ebay=mock", request.url));
  const env = mode.env;
  if (!canConnect(env)) return NextResponse.redirect(new URL(`/settings/ebay?ebay=missing-keys&env=${env}`, request.url));

  const state = randomBytes(24).toString("base64url");
  // Listing permission only when this business may publish (always on in sandbox, where nothing is real)
  const scopes = userScopes(env === "sandbox" || mode.canPublish || mode.publishingSwitch);
  const res = NextResponse.redirect(consentUrl(env, scopes, state));
  // Remember which business is connecting: the callback stores the account for that business
  res.cookies.set("ebay_oauth", JSON.stringify({ state, env, scopes, workspaceId: member.workspace.id }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/ebay",
    maxAge: 600,
  });
  return res;
}
