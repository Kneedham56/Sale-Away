import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

// Public page (listed in PUBLIC_PATHS). eBay requires a privacy policy URL for the app's sign-in link.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-10 text-[15px] leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="text-sm text-muted">Sale Away With Me · last updated October 17, 2026</p>
      <p>
        Sale Away With Me is a private inventory tool used by a small number of invited resellers to track what they buy, list, sell
        and ship. It is not open to the public and does not sell or share anyone&apos;s data.
      </p>
      <h2 className="pt-2 text-lg font-semibold">What it stores</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>The seller&apos;s own inventory, photos, costs, expenses and sales records.</li>
        <li>
          When a seller connects eBay: their eBay order details (item, price, fees, shipping status) and, for orders still to ship, the
          buyer&apos;s name and shipping address.
        </li>
        <li>An encrypted eBay authorization token, so the app can read the seller&apos;s orders. The app never sees eBay passwords.</li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold">How long</h2>
      <p>
        Buyer names and addresses are deleted 30 days after an order ships. Sales figures are kept for the seller&apos;s tax records.
      </p>
      <h2 className="pt-2 text-lg font-semibold">Who can see it</h2>
      <p>
        Only the seller who owns the business and the app&apos;s administrator. Each seller&apos;s data is kept separate. Data is
        stored with Supabase and the app runs on Vercel; photos may be sent to Google&apos;s Gemini service to draft listing text when the
        seller asks for it.
      </p>
      <h2 className="pt-2 text-lg font-semibold">Deletion</h2>
      <p>
        When eBay notifies the app that an eBay user has closed their account, the app erases that person&apos;s name, address and
        username from its records. A seller can disconnect eBay at any time in Settings or from their eBay account, and can ask the
        administrator to delete their data.
      </p>
    </main>
  );
}
