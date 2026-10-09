// Kartu & bagian Dashboard (server component, tanpa state). Tampilan mengikuti
// docs/design/prototipe-dashboard-oa.html; isi, link, dan kondisi tiap kartu tetap.
import { ArrowUpRight, ClipboardCheck, FileWarning, Hourglass } from "lucide-react";
import Link from "next/link";
import { ApprovalQueueTable } from "@/app/(main)/approval/approval-tables";
import { CorrectionList } from "@/app/(main)/approval/correction-ui";
import { ApprovalStepper } from "@/components/shared/approval-stepper";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { Stat, StatsBand as SharedStatsBand } from "@/components/shared/stats-band";
import { StatusBadge } from "@/components/shared/status-badge";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";
import { riseStyle } from "@/lib/motion";
import type { ApprovalRow } from "@/lib/services/approval-queries";
import type { ExpiringItem } from "@/lib/services/dashboard-queries";
import { cn } from "@/lib/utils";
import styles from "./dashboard.module.css";
import { StatNumber } from "./dashboard-motion";

// Dashboard dikunci (CATATAN-IMPLEMENTASI-HALAMAN.md, Keputusan 8): label status & keadaan kosong
// di sini memakai tampilan lama (`look="pill"` / `look="card"`).

export function DashboardCard({
  title,
  description,
  icon,
  action,
  children,
  className,
  style,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cn("panel-surface relative flex min-w-0 flex-col gap-4 p-5 sm:p-6", className)} style={style}>
      <SectionHeader icon={icon} title={title} description={description} action={action} />
      {children}
    </section>
  );
}

/* ---------- pita statistik (varian lg dari pita bersama) ---------- */

export function StatsBand({ children }: { children: React.ReactNode }) {
  return (
    <SharedStatsBand size="lg" className={styles.rise} style={riseStyle(5)}>
      {children}
    </SharedStatsBand>
  );
}

export function StatItem({
  label,
  value,
  unit,
  order,
  pictogram,
  footer,
  warn = false,
}: {
  label: string;
  value: number;
  unit?: string;
  /** Urutan hitung naik (0, 1, 2, …). */
  order: number;
  pictogram?: React.ReactNode;
  footer?: React.ReactNode;
  /** Keterangan bawah diberi titik kuning (perlu perhatian). */
  warn?: boolean;
}) {
  return (
    <Stat
      className={styles.stat}
      label={label}
      value={<StatNumber value={value} order={order} className={styles.statNum} />}
      unit={unit}
      aside={pictogram}
      sub={footer}
      warn={warn}
    />
  );
}

/** Piktogram orang untuk "Karyawan aktif". */
export function PeoplePictogram() {
  const tones = ["a", "", "b", "", "", "b", "", "a"];
  return (
    <span className={styles.people} aria-hidden>
      {tones.map((tone, index) => (
        <span key={index} className={tone === "a" ? styles.personA : tone === "b" ? styles.personB : undefined} />
      ))}
    </span>
  );
}

/** Piktogram map untuk "Project aktif". */
export function FolderPictogram() {
  return (
    <span className={styles.folder} aria-hidden>
      <span className={styles.folderTab} />
      <span className={styles.folderBack} />
      <span className={styles.folderSheet} />
      <span className={styles.folderFront} />
    </span>
  );
}

/* ---------- antrian approval ---------- */

/**
 * Bagian antrian approval. Tabelnya `ApprovalQueueTable` apa adanya (filter, cari, urut, paginasi,
 * Setujui/Koreksi/Batalkan); gayanya diatur dari `styles.queueTable`. Antrian kosong → stempel TUNTAS.
 */
export function QueueSection({ title, description, rows }: { title: string; description: string; rows: ApprovalRow[] }) {
  return (
    <section aria-labelledby="antrian-judul" className="relative flex flex-col gap-3.5">
      <div className={styles.rise} style={riseStyle(7)}>
        <SectionHeader
          icon={ClipboardCheck}
          title={title}
          titleId="antrian-judul"
          description={description}
          action={
            <Link
              href="/approval"
              className="group inline-flex min-h-11 items-center gap-3 rounded-full bg-brand-soft py-1 pr-1 pl-[18px] text-sm font-bold text-brand-deep outline-none transition-transform duration-500 ease-smooth focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-[0.97]"
            >
              Buka Approval Center
              <span
                className="flex size-9 items-center justify-center rounded-full bg-white transition-transform duration-500 ease-smooth group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-[1.06]"
                aria-hidden
              >
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          }
        />
      </div>
      {rows.length === 0 ? (
        <EmptyQueueSeal />
      ) : (
        <div className={styles.queueTable}>
          <ApprovalQueueTable rows={rows} />
        </div>
      )}
    </section>
  );
}

const sealDateFormat = new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "short", year: "numeric" });

/** Tanggal hari ini untuk stempel, mis. "08 OKT 2026". */
function sealDateLabel(): string {
  return sealDateFormat.format(new Date()).toUpperCase();
}

/** Lebar bar baris bayangan: [nama, sub-teks, kategori, diajukan]. */
const GHOST_ROWS = [
  ["62%", "34%", "56%", "60%"],
  ["48%", "28%", "44%", "52%"],
  ["56%", "30%", "60%", "46%"],
];

/** Antrian kosong: baris bayangan + stempel TUNTAS bertanggal. */
function EmptyQueueSeal() {
  return (
    <div className={styles.empty}>
      <div className={styles.ghostRows} aria-hidden>
        {GHOST_ROWS.map(([name, sub, category, submitted], index) => (
          <div key={index} className={styles.ghostRow}>
            <span className={styles.ghostWho}>
              <span className={styles.ghostAvatar} />
              <span className={styles.ghostLines}>
                <span className={styles.bar} style={{ width: name }} />
                <span className={cn(styles.bar, styles.barThin)} style={{ width: sub }} />
              </span>
            </span>
            <span className={styles.bar} style={{ width: category }} />
            <span className={styles.bar} style={{ width: "72%" }} />
            <span className={styles.bar} style={{ width: submitted }} />
            <span className={styles.bar} style={{ width: "68%" }} />
            <span className={cn(styles.bar, styles.barPill)} />
          </div>
        ))}
      </div>
      <div className={styles.seal} aria-hidden>
        <svg width="176" height="176" viewBox="0 0 200 200">
          <defs>
            <path id="segel-tuntas" d="M100 100m-73 0a73 73 0 1 1 146 0a73 73 0 1 1 -146 0" />
          </defs>
          <circle cx="100" cy="100" r="96" strokeWidth="3.5" />
          <circle cx="100" cy="100" r="89" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="62" strokeWidth="1.2" />
          <text transform="rotate(24 100 100)" className="font-mono" fontSize="12.5" fontWeight="600">
            <textPath href="#segel-tuntas" textLength="452" lengthAdjust="spacing">
              OFFICE AUTOMATION • PT ARTHA MITRA INTERDATA •{" "}
            </textPath>
          </text>
          <text x="100" y="97" textAnchor="middle" className="font-sans" fontSize="25" fontWeight="800" letterSpacing="1.2">
            TUNTAS
          </text>
          <path d="M62 105h76" strokeWidth="1.2" />
        </svg>
        <span className={styles.sealDate}>{sealDateLabel()}</span>
      </div>
      <div className={styles.emptyText}>
        <p className="text-[19px] leading-snug font-extrabold tracking-[-0.02em] text-ink">Antrian Anda kosong</p>
        <p className="mt-1.5 text-ink-3">Tidak ada pengajuan yang menunggu persetujuan Anda. Pengajuan baru dari tim akan muncul di sini.</p>
      </div>
    </div>
  );
}

/* ---------- kartu lain (isi tetap, gaya disesuaikan) ---------- */

/** Sertifikat & unit yang berakhir ≤ 30 hari (Admin). */
export function ExpiringCard({ items, includeAssets }: { items: ExpiringItem[]; includeAssets: boolean }) {
  return (
    <DashboardCard
      title="Akan Berakhir (30 hari)"
      description={includeAssets ? "Sertifikat karyawan, support & garansi unit" : "Sertifikat karyawan"}
      icon={Hourglass}
    >
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">Tidak ada yang berakhir dalam 30 hari ke depan.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.slice(0, 8).map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-300 ease-smooth hover:bg-white"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                  <p className="truncate text-xs text-ink-3">
                    {item.label} · {item.detail}
                  </p>
                </div>
                <StatusBadge look="pill" variant={item.daysLeft <= 7 ? "danger" : "warning"}>
                  {item.daysLeft === 0 ? "Hari ini" : `${item.daysLeft} hari lagi`}
                </StatusBadge>
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="px-3 pt-1 text-xs text-ink-3">+{items.length - 8} lainnya</li>}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Status pengajuan milik user (Staf). */
export function MyRequestsList({ rows }: { rows: ApprovalRow[] }) {
  if (rows.length === 0) {
    return <EmptyState look="card" title="Belum ada pengajuan" description="Pengajuan reimburse, cuti, dan klaim kesehatan Anda akan tampil di sini." />;
  }
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const meta = APPROVAL_MODULE_META[row.module];
        const badge = requestStatusBadge(row.status, row.currentLevel);
        return (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-2xl px-3 py-3 transition-colors duration-300 ease-smooth hover:bg-white sm:flex-row sm:items-center sm:justify-between"
          >
            <Link href={meta.path(row.entityId)} className="min-w-0 hover:underline">
              <p className="text-sm font-bold text-ink">
                {meta.label} · <span className="font-mono font-medium">{row.entityNumber}</span>
              </p>
              <p className="text-xs text-ink-3">Diajukan {formatDate(row.createdAt, "short")}</p>
              <CorrectionList corrections={row.corrections} className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground" />
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <ApprovalStepper steps={row.steps} requestStatus={row.status} compact />
              <StatusBadge look="pill" variant={badge.variant}>
                {badge.label}
              </StatusBadge>
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
        <p className="text-sm text-ink-3">Semua dokumen lengkap dan tidak ada sertifikat yang akan berakhir.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {certificates.map((c) => (
            <li key={c.id}>
              <Link href="/profil/sertifikat" className="flex items-center justify-between gap-3 rounded-[14px] bg-warning-soft px-3 py-2.5 hover:underline">
                <span className="min-w-0 truncate font-medium">Sertifikat {c.name}</span>
                <StatusBadge look="pill" variant={c.status === "EXPIRED" ? "danger" : "warning"}>
                  {c.status === "EXPIRED" ? "Kadaluarsa" : c.daysLeft === 0 ? "Berakhir hari ini" : `${c.daysLeft} hari lagi`}
                </StatusBadge>
              </Link>
            </li>
          ))}
          {documentMissing.length > 0 && (
            <li>
              <Link href="/profil/dokumen" className="block rounded-[14px] bg-danger-soft px-3 py-2.5 hover:underline">
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
