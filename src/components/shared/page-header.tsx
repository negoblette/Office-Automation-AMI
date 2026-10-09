import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { riseStyle } from "@/lib/motion";
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
  /** Hiasan di belakang judul (Dashboard: jam analog). */
  decoration?: React.ReactNode;
  /** Kelas gerak masuk tiap bagian. Default `rise` (halaman kerja); Dashboard memakai geraknya sendiri. */
  riseClassName?: string;
};

/**
 * Kepala halaman: breadcrumb kecil → judul besar → deskripsi → aksi di kanan.
 * Gaya sama dengan judul halaman Dashboard (versi tenang).
 */
export function PageHeader({ title, description, breadcrumbs, actions, className, decoration, riseClassName = "rise" }: PageHeaderProps) {
  return (
    <div className={cn("relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      {decoration}
      <div className="relative flex max-w-[700px] min-w-0 flex-col gap-1.5">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className={riseClassName} style={riseStyle(0)}>
            <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                    {item.href && !isLast ? (
                      <Link href={item.href} className="underline-offset-4 hover:underline">
                        {item.label}
                      </Link>
                    ) : (
                      <span className={cn(isLast && "font-bold text-brand")} aria-current={isLast ? "page" : undefined}>
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
        <h1
          className={cn("mt-1 text-[clamp(28px,5.2vw,36px)] leading-[1.12] font-extrabold tracking-[-0.035em] text-balance text-ink", riseClassName)}
          style={riseStyle(1)}
        >
          {title}
        </h1>
        {description && (
          <p className={cn("max-w-[62ch] text-[15px] text-ink-3", riseClassName)} style={riseStyle(2)}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className={cn("relative flex shrink-0 flex-wrap items-center gap-2", riseClassName)} style={riseStyle(2)}>
          {actions}
        </div>
      )}
    </div>
  );
}
