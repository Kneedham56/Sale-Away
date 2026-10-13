import { SignOutButton } from "./sign-out-button";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
          <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">Sale Away</span>
        </div>
        <SignOutButton />
      </header>
      <main className="flex-1 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>
    </div>
  );
}
