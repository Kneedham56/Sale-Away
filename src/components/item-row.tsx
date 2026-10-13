import Link from "next/link";

export function Thumb({ url, className = "h-14 w-14" }: { url?: string | null; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, already a small thumbnail
    <img src={url} alt="" className={`${className} shrink-0 rounded-lg bg-border object-cover`} loading="lazy" />
  ) : (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-border/60 text-muted`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="M21 16l-5-5-8 8" />
      </svg>
    </div>
  );
}

export function ItemRow({
  href,
  thumbUrl,
  title,
  meta,
  right,
}: {
  href: string;
  thumbUrl?: string | null;
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-3 py-2.5 active:bg-border/40">
        <Thumb url={thumbUrl} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] leading-snug font-medium">{title}</div>
          {meta && <div className="mt-0.5 truncate text-xs text-muted">{meta}</div>}
        </div>
        {right && <div className="shrink-0 text-right text-sm">{right}</div>}
      </Link>
    </li>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card px-4 py-10 text-center text-sm text-muted">{children}</p>;
}
