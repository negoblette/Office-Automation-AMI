import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { BreadcrumbItem } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import styles from "./dashboard.module.css";
import { Dial } from "./dashboard-motion";
import { riseStyle } from "./dashboard-ui";

/**
 * Kepala halaman Dashboard. Isi & semantiknya sama dengan `PageHeader` (breadcrumb → judul →
 * deskripsi → aksi di kanan), tampilannya mengikuti prototipe. Jam analog hanya tampil bila tidak
 * ada tombol aksi di kanan, supaya tidak menutupi tombol.
 */
export function DashboardHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      {!actions && <Dial />}
      <div className="relative flex max-w-[700px] min-w-0 flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className={styles.rise} style={riseStyle(0)}>
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
        <h1
          className={cn("mt-1 text-[clamp(28px,5.2vw,36px)] leading-[1.12] font-extrabold tracking-[-0.035em] text-balance text-ink", styles.rise)}
          style={riseStyle(1)}
        >
          {title}
        </h1>
        {description && (
          <p className={cn("max-w-[62ch] text-[15px] text-ink-3", styles.rise)} style={riseStyle(2)}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className={cn("relative flex shrink-0 flex-wrap items-center gap-2", styles.rise)} style={riseStyle(2)}>
          {actions}
        </div>
      )}
    </div>
  );
}
