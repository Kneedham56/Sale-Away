"use client";

import { useActionState } from "react";
import { createBusinessAction } from "./actions";
import { Field, SubmitButton } from "@/components/fields";

export function NewBusinessForm() {
  const [state, action] = useActionState(createBusinessAction, null);
  return (
    <form key={state?.ok ? state.data : "form"} action={action} className="space-y-3">
      <Field label="Business name">
        <input name="name" className="input" placeholder="e.g. Aunt Linda's Finds" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner's name">
          <input name="owner_name" className="input" required />
        </Field>
        <Field label="Owner's email (their login)">
          <input name="owner_email" type="email" className="input" required />
        </Field>
      </div>
      <p className="text-xs text-muted">
        It starts empty with the usual fee rates, categories and AI prompts. You&apos;re added as admin so you can open it for support.
      </p>
      {state && <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.ok ? state.data : state.error}</p>}
      <SubmitButton>Create business</SubmitButton>
    </form>
  );
}
