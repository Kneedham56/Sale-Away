import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: "seller" | "admin";
};

/** The signed-in member, or a redirect. Call inside a Suspense boundary (it reads cookies). */
export async function requireMember(): Promise<Member> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("user_id, email, display_name, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) redirect("/login?error=not-a-member");

  return {
    userId: member.user_id,
    email: member.email,
    displayName: member.display_name,
    role: member.role,
  };
}
