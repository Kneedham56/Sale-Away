import Link from "next/link";
import { currentMember } from "@/lib/auth";

/** Which business is open, shown in the header when the login can open more than one. */
export async function BusinessName() {
  const me = await currentMember();
  if (!me || me.workspaces.length < 2) return null;
  return (
    <Link href="/businesses" className="max-w-40 truncate rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
      {me.workspace.name} ▾
    </Link>
  );
}
