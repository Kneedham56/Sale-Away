import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { QuickCheck } from "./quick-check";

export const metadata: Metadata = { title: "Quick Check" };
export const maxDuration = 60;

export default async function QuickCheckPage() {
  await requireMember();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Quick Check" subtitle="Snap it in the store: KEEP or DONATE in seconds. $20 / 45-day rule." />
      <QuickCheck geminiAvailable={!!process.env.GEMINI_API_KEY} />
    </div>
  );
}
