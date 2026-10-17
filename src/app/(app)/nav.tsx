"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phone: her daily loop. Everything else is behind the menu button in the header.
const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/unlisted", label: "Inventory", icon: BoxIcon },
  { href: "/add", label: "Add", icon: PlusIcon, primary: true },
  { href: "/listed", label: "Listed", icon: TagIcon },
  { href: "/outgoing", label: "Outgoing", icon: TruckIcon },
];

// Computer: the whole workflow in order, then hindsight and settings
const DESKTOP_LINKS = [
  { href: "/", label: "Home" },
  { href: "/trips", label: "Trips" },
  { href: "/unlisted", label: "Inventory" },
  { href: "/add", label: "+ Add item" },
  { href: "/listed", label: "Listed" },
  { href: "/outgoing", label: "Outgoing" },
  { href: "/completed", label: "Completed" },
  { href: "/insights", label: "Insights" },
  { href: "/more", label: "More" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function BottomNav() {
  return <BottomNavView path={usePathname()} />;
}

/** Path-independent render, also used as the Suspense fallback while the URL streams in. */
export function BottomNavView({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
      <ul className="mx-auto flex max-w-lg items-end justify-around">
        {TABS.map(({ href, label, icon: Icon, primary }) => {
          const active = isActive(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                {primary ? (
                  <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-lg">
                    <Icon className="h-7 w-7" />
                  </span>
                ) : (
                  <Icon className="h-6 w-6" />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopNav() {
  return <TopNavView path={usePathname()} />;
}

export function TopNavView({ path }: { path: string }) {
  const links = DESKTOP_LINKS;
  return (
    <nav className="hidden md:block print:hidden">
      <ul className="flex flex-wrap gap-1">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${isActive(path, href) ? "bg-accent/10 text-accent" : "text-muted hover:text-fg"}`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type IconProps = { className?: string };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function HomeIcon(p: IconProps) {
  return <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
}
function BoxIcon(p: IconProps) {
  return <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>;
}
function PlusIcon(p: IconProps) {
  return <svg viewBox="0 0 24 24" className={p.className} {...stroke} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>;
}
function TagIcon(p: IconProps) {
  return <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M20 12l-8 8-9-9V3h8l9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>;
}
function TruckIcon(p: IconProps) {
  return <svg viewBox="0 0 24 24" className={p.className} {...stroke}><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
}
