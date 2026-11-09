import { CheckCheck, Clock, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ExportItem, ExportSelector } from "@/components/shared/export-selector";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate, formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { listReimbursements } from "@/lib/services/reimbursement-queries";
import { ReimbursementTable } from "./reimbursement-table";

export const metadata: Metadata = { title: "Reimburse" };

export default async function ReimbursePage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const rows = await listReimbursements(prisma, user);
  // Pilihan ekspor: pengajuan yang menunggu / disetujui (draft & yang ditolak tidak ikut).
  const exportItems: ExportItem[] = rows
    .filter((row) => (row.status === "PENDING" || row.status === "APPROVED") && row.number)
    .map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      title: row.number!,
      subtitle: `${formatDate(row.submittedAt ?? row.createdAt, "short")} · ${row.summary}${row.itemCount > 1 ? ` (+${row.itemCount - 1} baris)` : ""}`,
      amount: row.total,
      month: toJakartaIsoDate(row.submittedAt ?? row.createdAt).slice(0, 7),
      status: row.status,
      currentLevel: row.currentLevel,
    }));

  const thisMonth = toJakartaIsoDate().slice(0, 7);
  // Pengajuan yang ditolak tidak dihitung (2026-11-04); dihitung lagi setelah direvisi & diajukan ulang.
  const submittedThisMonth = rows.filter((row) => row.status !== "REJECTED" && row.submittedAt && toJakartaIsoDate(row.submittedAt).startsWith(thisMonth));
  const pending = rows.filter((row) => row.status === "PENDING");
  const approved = rows.filter((row) => row.status === "APPROVED");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reimburse"
        description={isAdmin ? "Semua pengajuan reimburse karyawan, beserta draft milik Anda." : "Pengajuan reimburse Anda dan status approval-nya."}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse" }]}
        actions={
          <Link href="/reimburse/baru" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> Pengajuan Baru
          </Link>
        }
      />

      {/* Ekspor laporan (2026-11-09): pilih karyawan → pilih pengajuan → Ekspor PDF / Excel. */}
      <ExportSelector
        items={exportItems}
        allowAllEmployees={isAdmin}
        defaultEmployeeId={user.employeeId}
        noun="reimburse"
        pdfPath="/cetak/reimburse"
        excelPath="/api/export/reimburse"
      />

      {/* HP: kartu Rupiah selebar penuh, dua kartu jumlah berdampingan. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 max-sm:[&>:first-child]:col-span-2">
        <StatCard
          label="Diajukan bulan ini"
          value={formatRupiah(submittedThisMonth.reduce((sum, row) => sum + row.total, 0))}
          icon={Wallet}
          footer={`${submittedThisMonth.length} pengajuan`}
        />
        <StatCard
          label="Menunggu approval"
          value={pending.length}
          unit="pengajuan"
          icon={Clock}
          tone="warning"
          footer={formatRupiah(pending.reduce((sum, row) => sum + row.total, 0))}
        />
        <StatCard
          label="Disetujui"
          value={approved.length}
          unit="pengajuan"
          icon={CheckCheck}
          tone="success"
          footer={formatRupiah(approved.reduce((sum, row) => sum + row.total, 0))}
        />
      </div>

      <ReimbursementTable rows={rows} showRequester={isAdmin} />
    </div>
  );
}
