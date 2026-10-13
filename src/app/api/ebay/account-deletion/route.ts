import { createHash, verify as verifySignature } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppToken } from "@/lib/ebay/client";
import { hasCredentials } from "@/lib/ebay/config";

// eBay Marketplace Account Deletion notifications (required for production keys).
// GET answers eBay's endpoint challenge; POST receives a notice and erases that user's data.
// Public route: no session (listed in PUBLIC_PATHS in proxy.ts).

function endpointUrl(request: NextRequest) {
  return process.env.EBAY_DELETION_ENDPOINT ?? `${request.nextUrl.origin}${request.nextUrl.pathname}`;
}

export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  if (!challengeCode || !token) return NextResponse.json({ error: "not configured" }, { status: 400 });
  const challengeResponse = createHash("sha256").update(challengeCode).update(token).update(endpointUrl(request)).digest("hex");
  return NextResponse.json({ challengeResponse }, { headers: { "content-type": "application/json" } });
}

const keyCache = new Map<string, string>();

/** Verifies X-EBAY-SIGNATURE with eBay's public key (ECDSA). */
async function verified(raw: string, header: string | null): Promise<boolean> {
  if (!header || !hasCredentials("production")) return false;
  try {
    const sig = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { kid: string; signature: string };
    let pem = keyCache.get(sig.kid);
    if (!pem) {
      const res = await fetch(`https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(sig.kid)}`, {
        headers: { authorization: `Bearer ${await getAppToken("production")}` },
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { key: string };
      pem = body.key.includes("BEGIN PUBLIC KEY")
        ? body.key.replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n").replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----")
        : `-----BEGIN PUBLIC KEY-----\n${body.key}\n-----END PUBLIC KEY-----`;
      keyCache.set(sig.kid, pem);
    }
    return verifySignature("sha1", Buffer.from(raw), { key: pem, dsaEncoding: "der" }, Buffer.from(sig.signature, "base64"));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!(await verified(raw, request.headers.get("x-ebay-signature")))) {
    return new NextResponse(null, { status: 412 });
  }
  let payload: { notification?: { notificationId?: string; data?: { username?: string; userId?: string } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const n = payload.notification;
  const username = n?.data?.username;
  const userId = n?.data?.userId;
  const admin = createAdminClient();
  let scrubbed = 0;

  if (username) {
    // Erase buyer details we hold for this eBay user; keep the sale's money figures for her books
    const { count } = await admin
      .from("sales")
      .update({ buyer_name: null, ship_to: null, buyer_username: null }, { count: "exact" })
      .eq("buyer_username", username);
    scrubbed += count ?? 0;
  }
  if (userId) {
    // If the seller account itself is closed, drop the connection
    const { count } = await admin.from("ebay_connection").delete({ count: "exact" }).eq("ebay_user_id", userId);
    scrubbed += count ?? 0;
  }
  await admin
    .from("ebay_deletion_notices")
    .upsert({ notification_id: n?.notificationId ?? null, rows_scrubbed: scrubbed }, { onConflict: "notification_id" });

  return new NextResponse(null, { status: 204 });
}
