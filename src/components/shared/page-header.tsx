import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  /** Tombol aksi di kanan judul. */
  actions?: React.ReactNode;
  className?: string;
};

/** Kepala halaman: breadcrumb kecil → judul besar → deskripsi abu → aksi di kanan. */
export function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                    {item.href && !isLast ? (
                      <Link href={item.href} className="hover:text-foreground">
                        {item.label}
                      </Link>
                    ) : (
                      <span className={cn(isLast && "text-primary")} aria-current={isLast ? "page" : undefined}>
                        {item.label}
                      </span>
                    )}
                    {!isLast && <ChevronRight className="size-3.5" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
