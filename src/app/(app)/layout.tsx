import Link from "next/link";
import { Suspense } from "react";
import { BottomNav, BottomNavView, MenuIcon, TopNav, TopNavView } from "./nav";
import { OfflineBanner } from "./offline-banner";
import { BusinessName } from "./business-name";
import { SignOutButton } from "./more/sign-out-button";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <OfflineBanner />
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center gap-6 px-4 pt-3 pb-2 md:px-6 print:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
            <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Sale Away</span>
          </Link>
          <Suspense>
            <BusinessName />
          </Suspense>
          <Suspense fallback={<TopNavView path="" />}>
            <TopNav />
          </Suspense>
          <div className="ml-auto hidden md:block">
            <SignOutButton className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg" />
          </div>
          <Link href="/more" aria-label="Menu" className="ml-auto rounded-lg p-2 text-muted active:bg-border/40 md:hidden">
            <MenuIcon className="h-6 w-6" />
          </Link>
        </header>
        <main className="px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-6 md:pb-10">{children}</main>
      </div>
      <Suspense fallback={<BottomNavView path="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
