import { cn } from "@/lib/utils";

/** Judul bagian: 21px tebal (dipakai juga kepala kalender). */
export const sectionTitleClass = "text-[21px] leading-tight font-extrabold tracking-[-0.025em] text-ink";
/** Ubin ikon 46px di kiri judul — hanya untuk bagian yang memang sudah punya ikon. */
export const sectionIconClass = "flex size-[46px] shrink-0 items-center justify-center rounded-[15px] bg-brand-soft text-brand";

/**
 * Judul bagian: judul, satu kalimat penjelas, dan aksi di kanan. Versi tenang tanpa ikon;
 * ubin ikon hanya bila `icon` diberikan (mis. bagian Dashboard).
 */
export function SectionHeader({
  title,
  titleId,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  titleId?: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5", className)}>
      <div className="flex items-center gap-3.5">
        {Icon && (
          <span className={sectionIconClass} aria-hidden>
            <Icon className="size-[22px]" />
          </span>
        )}
        <div>
          <h2 id={titleId} className={sectionTitleClass}>
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
