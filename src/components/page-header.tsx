import Link from "next/link";

export function PageHeader({
  title,
  back,
  subtitle,
  actions,
}: {
  title: string;
  back?: { href: string; label?: string };
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 pt-1">
      {back && (
        <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-accent print:hidden">
          ‹ {back.label ?? "Back"}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 gap-2 print:hidden">{actions}</div>}
      </div>
    </div>
  );
}
