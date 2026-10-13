"use client";

import { useOffline } from "next/offline";

export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div className="sticky top-0 z-40 bg-coral px-4 py-2 text-center text-sm font-medium text-white">
      No signal. Saves will retry when you&apos;re back online.
    </div>
  );
}
