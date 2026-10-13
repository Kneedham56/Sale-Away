import Link from "next/link";
import { Suspense } from "react";
import { BottomNav, BottomNavView, TopNav, TopNavView } from "./nav";
import { OfflineBanner } from "./offline-banner";

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
          <Suspense fallback={<TopNavView path="" />}>
            <TopNav />
          </Suspense>
        </header>
        <main className="px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-6 md:pb-10">{children}</main>
      </div>
      <Suspense fallback={<BottomNavView path="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
