import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validWorkspaceId, WORKSPACE_COOKIE } from "@/lib/workspace";

// Opens a business: /api/workspace?id=<business id>. Without an id, opens the login's own (first) business.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const { data: links } = await supabase.from("workspace_members").select("workspace_id, role").eq("user_id", userId);
  const allowed = (links ?? []).sort((a, b) => (a.role === "owner" ? -1 : 1) - (b.role === "owner" ? -1 : 1));
  const wanted = validWorkspaceId(request.nextUrl.searchParams.get("id"));
  const target = allowed.find((l) => l.workspace_id === wanted)?.workspace_id ?? allowed[0]?.workspace_id;
  if (!target) return NextResponse.redirect(new URL("/login?error=no-business", request.url));

  const res = NextResponse.redirect(new URL(request.nextUrl.searchParams.get("next") ?? "/", request.url));
  res.cookies.set(WORKSPACE_COOKIE, target, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return res;
}
