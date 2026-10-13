import { FileDown, UserX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { ChangePreviewButton } from "@/components/shared/change-preview";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { formatDateTime } from "@/lib/format";
import { listProfileChanges, type ProfileChangeView } from "@/lib/services/profile-change";

const TABS = [
  { key: "data-diri", label: "Data Diri", href: "/profil" },
  { key: "dokumen", label: "Dokumen & Keluarga", href: "/profil/dokumen" },
  { key: "sertifikat", label: "Sertifikat & Ijazah", href: "/profil/sertifikat" },
  { key: "aset", label: "Inventory Kantor", href: "/profil/aset" },
  { key: "inventory", label: "Inventory Saya", href: "/profil/inventory" },
].filter((tab) => tab.key !== "inventory" || FEATURES.inventory);

/** Kepala halaman + tab untuk semua halaman Profil Saya (+ daftar perubahan yang menunggu persetujuan). */
export async function ProfileShell({
  active,
  title,
  description,
  children,
  employeeId,
}: {
  active: string;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Bila diisi, tampil tombol "Download Biodata (PDF)". */
  employeeId?: string | null;
}) {
  const tab = TABS.find((t) => t.key === active);
  const user = await requireUser();
  const changes = user.employeeId ? await listProfileChanges(prisma, user.employeeId) : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Profil Saya", href: "/profil" }, ...(tab && tab.key !== "data-diri" ? [{ label: tab.label }] : [])]}
        actions={
          employeeId ? (
            <Link href={`/biodata/${employeeId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <FileDown aria-hidden /> Download Biodata (PDF)
            </Link>
          ) : undefined
        }
      />
      <LinkTabs label="Profil Saya" active={active} tabs={TABS} />
      <ProfileChangesPanel changes={changes} />
      {children}
    </div>
  );
}

/** Akun tanpa data karyawan (seharusnya tidak terjadi untuk akun yang dibuat lewat aplikasi). */
export function NoEmployeeRecord() {
  return (
    <EmptyState icon={UserX} title="Akun belum terhubung ke data karyawan" description="Hubungi Admin untuk menghubungkan akun Anda." />
  );
}

/**
 * Perubahan data milik sendiri tidak langsung tersimpan (2026-10-12): tampil di sini sampai disetujui
 * Ci Ika. Yang ditolak menampilkan alasannya — ubah lagi datanya untuk mengajukan revisi.
 */
function ProfileChangesPanel({ changes }: { changes: ProfileChangeView[] }) {
  if (changes.length === 0) return null;
  const pending = changes.filter((c) => c.status === "PENDING").length;
  return (
    <section className="rounded-2xl border border-warning/40 bg-warning-soft/40 p-4">
      <h2 className="text-sm font-semibold">
        Perubahan data{pending ? ` — ${pending} menunggu approval Admin` : ""}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">Data di halaman ini baru berubah setelah disetujui. Perubahan yang ditolak bisa diubah lalu diajukan lagi.</p>
      <ul className="flex flex-col gap-2">
        {changes.map((c) => {
          const badge = requestStatusBadge(c.status, c.status === "PENDING" ? 1 : null);
          return (
            <li key={c.id} className="rounded-xl bg-card p-3 text-sm shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.kindLabel}</span>
                <StatusBadge variant={badge.variant}>{c.status === "PENDING" ? "Menunggu persetujuan" : badge.label}</StatusBadge>
                <span className="text-xs text-muted-foreground">
                  {c.number} · {formatDateTime(c.createdAt)}
                </span>
              </div>
              <div className="mt-2">
                <ChangePreviewButton title={`${c.number} · ${c.kindLabel}`} lines={c.summary} />
              </div>
              {c.rejection && (
                <p className="mt-1 text-xs font-medium text-danger">
                  Ditolak {c.rejection.by}: {c.rejection.reason}
                  {c.kind === "SELF_DATA" && (
                    <>
                      {" "}
                      <Link href="/profil" className="underline">
                        Revisi &amp; ajukan ulang
                      </Link>
                    </>
                  )}
                  {c.kind !== "SELF_DATA" && " — ubah lagi datanya untuk mengajukan revisi."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
