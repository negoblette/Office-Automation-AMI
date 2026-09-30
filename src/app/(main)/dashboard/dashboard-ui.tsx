// Kartu-kartu dashboard (server component, tanpa state).
import { CalendarDays, FileWarning, Flag, Hourglass } from "lucide-react";
import Link from "next/link";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { formatDate } from "@/lib/format";
import type { ApprovalRow } from "@/lib/services/approval-queries";
import type { ExpiringItem, WeekEvent } from "@/lib/services/dashboard-queries";
import { cn } from "@/lib/utils";

const date = (iso: string, style: "short" | "long" = "short") => formatDate(`${iso}T00:00:00Z`, style);
const DAY_NAMES = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

export function DashboardCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-primary">
            <Icon className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Kalender libur & cuti pekan ini (desain 01). */
export function WeekCard({ week }: { week: { start: string; end: string; events: WeekEvent[] } }) {
  return (
    <DashboardCard
      title="Kalender Libur & Cuti"
      description={`Pekan ini: ${date(week.start)} – ${date(week.end)}`}
      icon={CalendarDays}
      action={
        <Link href="/cuti/kalender" className="text-sm font-medium text-primary hover:underline">
          Lihat kalender
        </Link>
      }
    >
      {week.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada cuti atau hari libur pekan ini.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {week.events.map((event) => {
            const day = event.kind === "leave" ? (event.startDate < week.start ? week.start : event.startDate) : event.date;
            const d = new Date(`${day}T00:00:00Z`);
            return (
              <li key={event.key} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-card py-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">{DAY_NAMES[d.getUTCDay()]}</span>
                  <span className="text-lg leading-none font-bold">{d.getUTCDate()}</span>
                </div>
                {event.kind === "leave" ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {event.isDirector && <span className="mr-1 rounded bg-warning-soft px-1.5 py-0.5 text-xs">Direktur cuti</span>}
                      {event.employeeName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cuti {date(event.startDate)} – {date(event.endDate)} · {event.workingDays} hari kerja
                    </p>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Flag className="size-4 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{event.name}</p>
                      <p className="text-xs text-muted-foreground">Libur · {date(event.date, "long")}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Sertifikat & unit yang berakhir ≤ 30 hari (Admin). */
export function ExpiringCard({ items, includeAssets }: { items: ExpiringItem[]; includeAssets: boolean }) {
  return (
    <DashboardCard
      title="Akan Berakhir (30 hari)"
      description={includeAssets ? "Sertifikat karyawan, support & garansi unit" : "Sertifikat karyawan"}
      icon={Hourglass}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada yang berakhir dalam 30 hari ke depan.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.slice(0, 8).map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.label} · {item.detail}
                  </p>
                </div>
                <StatusBadge variant={item.daysLeft <= 7 ? "danger" : "warning"}>
                  {item.daysLeft === 0 ? "Hari ini" : `${item.daysLeft} hari lagi`}
                </StatusBadge>
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="pt-2.5 text-xs text-muted-foreground">+{items.length - 8} lainnya</li>}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Status pengajuan milik user (Staf). */
export function MyRequestsList({ rows }: { rows: ApprovalRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Belum ada pengajuan" description="Pengajuan reimburse, cuti, dan klaim kesehatan Anda akan tampil di sini." />;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const meta = APPROVAL_MODULE_META[row.module];
        const badge = requestStatusBadge(row.status, row.currentLevel);
        return (
          <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href={meta.path(row.entityId)} className="min-w-0 hover:underline">
              <p className="text-sm font-semibold">
                {meta.label} · <span className="font-mono">{row.entityNumber}</span>
              </p>
              <p className="text-xs text-muted-foreground">Diajukan {formatDate(row.createdAt, "short")}</p>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <ApprovalStepper steps={row.steps} requestStatus={row.status} compact />
              <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type ReminderCertificate = { id: string; name: string; daysLeft: number | null; status: string };

/** Reminder Staf: dokumen belum lengkap & sertifikat akan/sudah kadaluarsa. */
export function StaffReminderCard({ documentMissing, certificates }: { documentMissing: string[]; certificates: ReminderCertificate[] }) {
  const empty = documentMissing.length === 0 && certificates.length === 0;
  return (
    <DashboardCard title="Reminder" description="Hal yang perlu Anda lengkapi" icon={FileWarning}>
      {empty ? (
        <p className="text-sm text-muted-foreground">Semua dokumen lengkap dan tidak ada sertifikat yang akan berakhir.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {certificates.map((c) => (
            <li key={c.id}>
              <Link href="/profil/sertifikat" className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-3 py-2.5 hover:underline">
                <span className="min-w-0 truncate font-medium">Sertifikat {c.name}</span>
                <StatusBadge variant={c.status === "EXPIRED" ? "danger" : "warning"}>
                  {c.status === "EXPIRED" ? "Kadaluarsa" : c.daysLeft === 0 ? "Berakhir hari ini" : `${c.daysLeft} hari lagi`}
                </StatusBadge>
              </Link>
            </li>
          ))}
          {documentMissing.length > 0 && (
            <li>
              <Link href="/profil/dokumen" className="block rounded-xl bg-danger-soft px-3 py-2.5 hover:underline">
                <span className="font-medium">{documentMissing.length} dokumen belum diupload:</span>{" "}
                <span className="text-muted-foreground">
                  {documentMissing.slice(0, 4).join(", ")}
                  {documentMissing.length > 4 ? ", …" : ""}
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}
