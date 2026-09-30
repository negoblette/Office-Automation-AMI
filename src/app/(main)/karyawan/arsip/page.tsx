import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listEmployees } from "@/lib/services/employee-queries";
import { KaryawanTabs } from "../karyawan-tabs";
import { ArchiveTable } from "./archive-table";

export const metadata: Metadata = { title: "Arsip Karyawan" };

export default async function ArsipKaryawanPage() {
  await requireAdmin();
  const [rows, activeCount] = await Promise.all([
    listEmployees(prisma, "RESIGNED"),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Arsip Karyawan"
        description="Karyawan yang sudah resign. Datanya tetap tersimpan dan bisa diaktifkan kembali (rehire) dengan periode kerja baru."
        breadcrumbs={[{ label: "SDM" }, { label: "Karyawan & Dokumen", href: "/karyawan" }, { label: "Arsip" }]}
      />
      <KaryawanTabs active="arsip" activeCount={activeCount} archiveCount={rows.length} />
      <ArchiveTable rows={rows} />
    </div>
  );
}
