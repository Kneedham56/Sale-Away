"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBusiness } from "@/lib/data/businesses";
import { attempt, FormError, requiredText, type ActionResult } from "@/lib/form";

export async function createBusinessAction(_prev: unknown, fd: FormData): Promise<ActionResult<string>> {
  return attempt(async () => {
    await requireAdmin();
    const name = requiredText(fd, "name", "Business name");
    const ownerEmail = requiredText(fd, "owner_email", "Owner email");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) throw new FormError("That email doesn't look right.");
    const ownerName = requiredText(fd, "owner_name", "Owner name");
    const { ownerCreated } = await createBusiness(createAdminClient(), { name, ownerEmail, ownerName });
    refresh();
    return ownerCreated
      ? `Created “${name}” and a login for ${ownerEmail}. Set their password: npm.cmd run set-password -- ${ownerEmail}`
      : `Created “${name}” for ${ownerEmail} (they already had a login).`;
  });
}
