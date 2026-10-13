import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validWorkspaceId, WORKSPACE_COOKIE, WORKSPACE_HEADER } from "@/lib/workspace";

/**
 * Supabase client acting as the signed-in user (RLS applies), scoped to the active business.
 * Create one per request.
 */
export async function createClient() {
  // Her data is private and live: always render at request time (Supabase also reads the clock to check tokens,
  // which Cache Components rejects during prefetch).
  await connection();
  const cookieStore = await cookies();
  const workspaceId = validWorkspaceId(cookieStore.get(WORKSPACE_COOKIE)?.value);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: workspaceId ? { [WORKSPACE_HEADER]: workspaceId } : {} },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
          }
        },
      },
    }
  );
}
