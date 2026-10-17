import Link from "next/link";
import { Suspense } from "react";
import { BottomNav, BottomNavView, TopNav, TopNavView } from "./nav";
import { OfflineBanner } from "./offline-banner";
import { BusinessName } from "./business-name";
import { SignOutButton } from "./more/sign-out-button";

const menuIcon = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

/**
 * Wide screens (lg+): one header row with the workflow links. Phones and tablets: bottom tab bar + menu button.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <OfflineBanner />
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center gap-4 px-4 pt-3 pb-2 lg:gap-5 lg:px-6 print:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Home">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
            <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Sale Away</span>
          </Link>
          <Suspense fallback={<TopNavView path="" />}>
            <TopNav />
          </Suspense>
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <Link href="/add" className="hidden rounded-lg bg-coral px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white lg:inline-block">
              + Add item
            </Link>
            <Suspense>
              <BusinessName />
            </Suspense>
            <Link href="/more" aria-label="Menu" title="Menu" className="rounded-lg p-1.5 text-muted hover:text-fg active:bg-border/40">
              {menuIcon}
            </Link>
            <div className="hidden lg:block">
              <SignOutButton className="rounded-lg px-2 py-1.5 text-sm whitespace-nowrap text-muted hover:text-fg" />
            </div>
          </div>
        </header>
        <main className="px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:px-6 lg:pb-10">{children}</main>
      </div>
      <Suspense fallback={<BottomNavView path="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
