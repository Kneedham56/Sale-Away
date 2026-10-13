"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Email + password, each person their own (iPhone Keychain remembers it).
// Supabase's built-in mailer only reaches project team members, so emailed codes/links aren't reliable
// until a custom SMTP sender is set up.
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "not-a-member" ? "That account isn't set up for this app." : null
  );

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError(/invalid/i.test(error.message) ? "Email or password didn't match." : error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
