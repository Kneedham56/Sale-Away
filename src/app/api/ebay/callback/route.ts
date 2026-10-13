import { NextResponse, type NextRequest } from "next/server";
import { currentMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEbayClient } from "@/lib/ebay/client";
import { exchangeCodeAndStore } from "@/lib/ebay/tokens";

// eBay sends her back here after she approves. Register this URL as the RuName's "auth accepted URL".
export async function GET(request: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}`, request.url));
    res.cookies.delete({ name: "ebay_oauth", path: "/api/ebay" });
    return res;
  };
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(`ebay=declined`);
  let saved: { state: string; env: "sandbox" | "production"; scopes: string[]; workspaceId: string };
  try {
    saved = JSON.parse(request.cookies.get("ebay_oauth")?.value ?? "");
  } catch {
    return back("ebay=expired");
  }
  const code = params.get("code");
  if (!code || params.get("state") !== saved.state) return back("ebay=bad-state");
  if (!member.workspaces.some((w) => w.id === saved.workspaceId)) return back("ebay=bad-state");

  try {
    await exchangeCodeAndStore(saved.env, saved.workspaceId, code, saved.scopes, member.userId);
    const user = await getEbayClient(saved.env, saved.workspaceId).getUser();
    const admin = createAdminClient();
    await admin
      .from("ebay_connection")
      .update({ ebay_user_id: user.userId, ebay_username: user.username })
      .eq("workspace_id", saved.workspaceId)
      .eq("environment", saved.env);
    await admin.from("activity_log").insert({
      workspace_id: saved.workspaceId,
      actor: member.userId,
      action: "ebay.connected",
      detail: { environment: saved.env, username: user.username, scopes: saved.scopes },
    });
    return back(`ebay=connected&env=${saved.env}`);
  } catch (e) {
    console.error(e);
    return back(`ebay=failed&reason=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "unknown")}`);
  }
}
