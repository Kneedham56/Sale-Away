import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentMember } from "@/lib/auth";
import { hasCredentials, userScopes, writeEnabled } from "@/lib/ebay/config";
import { consentUrl } from "@/lib/ebay/tokens";

// Sends her to eBay's own sign-in page. She approves there; the app never sees her eBay password.
export async function GET(request: NextRequest) {
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL("/login", request.url));
  const env = request.nextUrl.searchParams.get("env") === "sandbox" ? "sandbox" : "production";
  if (!hasCredentials(env)) return NextResponse.redirect(new URL(`/settings/ebay?ebay=missing-keys&env=${env}`, request.url));

  const state = randomBytes(24).toString("base64url");
  const scopes = userScopes(writeEnabled());
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
