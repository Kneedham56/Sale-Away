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
  // Every outcome goes in the Activity log, so a failed connect can be diagnosed later
  const record = async (action: string, detail: Record<string, unknown>) =>
    createAdminClient()
      .from("activity_log")
      .insert({ workspace_id: member.workspace.id, actor: member.userId, action, detail })
      .then(() => undefined, () => undefined);
  if (params.get("error")) {
    await record("ebay.connect_declined", { error: params.get("error"), description: params.get("error_description") });
    return back(`ebay=declined`);
  }
  let saved: { state: string; env: "sandbox" | "production"; scopes: string[]; workspaceId: string };
  try {
    saved = JSON.parse(request.cookies.get("ebay_oauth")?.value ?? "");
  } catch {
    await record("ebay.connect_failed", { reason: "sign-in took too long or cookie missing" });
    return back("ebay=expired");
  }
  const code = params.get("code");
  if (!code || params.get("state") !== saved.state) {
    await record("ebay.connect_failed", { reason: "state mismatch" });
    return back("ebay=bad-state");
  }
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
    await record("ebay.connect_failed", { environment: saved.env, reason: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    return back(`ebay=failed&reason=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 200) : "unknown")}`);
  }
}
