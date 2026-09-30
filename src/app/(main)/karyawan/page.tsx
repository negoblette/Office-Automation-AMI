import { Archive, CircleAlert, ClipboardCheck, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import type { Division } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { DIVISION_LABEL } from "@/lib/labels";
import { listEmployees } from "@/lib/services/employee-queries";
import { EmployeeTable } from "./employee-table";
import { KaryawanTabs } from "./karyawan-tabs";

export const metadata: Metadata = { title: "Karyawan & Dokumen" };

export default async function KaryawanPage() {
  await requireAdmin();
  const [rows, archiveCount] = await Promise.all([
    listEmployees(prisma, "ACTIVE"),
    prisma.employee.count({ where: { status: "RESIGNED" } }),
  ]);

  const thisMonth = toJakartaIsoDate().slice(0, 7);
  const joinedThisMonth = rows.filter((row) => row.startDate?.startsWith(thisMonth)).length;
  const complete = rows.filter((row) => row.profilePercent === 100).length;
  const divisions = (Object.keys(DIVISION_LABEL) as Division[]).map((division) => ({
    division,
    count: rows.filter((row) => row.division === division).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Direktori Karyawan & Dokumen"
        description="Kelola data karyawan aktif dan pantau kelengkapan data diri yang diisi masing-masing karyawan."
        breadcrumbs={[{ label: "SDM" }, { label: "Karyawan & Dokumen" }]}
        actions={
          <>
            <Link href="/karyawan/arsip" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Archive aria-hidden /> Arsip
            </Link>
            <Link href="/karyawan/baru" className={buttonVariants({ size: "lg", className: "bg-foreground text-background hover:bg-foreground/90" })}>
              <Plus aria-hidden /> Tambah Karyawan
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Karyawan Aktif"
          value={rows.length}
          icon={Users}
          footer={joinedThisMonth > 0 ? `+${joinedThisMonth} bergabung bulan ini` : "Belum ada yang bergabung bulan ini"}
        />
        <StatCard
          label="Data Diri Lengkap"
          value={complete}
          unit={`/ ${rows.length}`}
          icon={ClipboardCheck}
          tone="success"
          footer={<ProgressBar value={rows.length ? (complete / rows.length) * 100 : 0} tone="success" />}
        />
        <StatCard
          label="Belum Lengkap"
          value={rows.length - complete}
          unit="karyawan"
          icon={CircleAlert}
          tone="danger"
          footer="Perlu melengkapi data di Profil Saya"
        />
        <StatCard label="Arsip (Resign)" value={archiveCount} unit="orang" icon={Archive} tone="neutral" footer="Data tetap tersimpan" />
      </div>

      <KaryawanTabs active="aktif" activeCount={rows.length} archiveCount={archiveCount} />

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <EmployeeTable rows={rows} />

        <aside className="h-fit rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold">Distribusi Divisi</h2>
          <ul className="space-y-4">
            {divisions.map(({ division, count }) => (
              <li key={division} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{DIVISION_LABEL[division]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {count} ({rows.length ? Math.round((count / rows.length) * 100) : 0}%)
                  </span>
                </div>
                <ProgressBar value={rows.length ? (count / rows.length) * 100 : 0} />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
