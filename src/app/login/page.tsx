import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
        <img src="/icons/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight">Sale Away With Me</h1>
        <p className="mt-1 text-sm text-muted">Sign in to keep selling.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
