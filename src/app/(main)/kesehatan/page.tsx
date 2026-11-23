import type { Metadata } from "next";
import { type ExportItem, ExportSelector } from "@/components/shared/export-selector";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getHealthSummary, listHealthCategories, listHealthClaims } from "@/lib/services/health-queries";
import { HealthClaimDialog } from "./claim-form";
import { HealthClaimTable } from "./claim-table";
import { HealthSummaryCard, KesehatanTabs } from "./health-ui";

export const metadata: Metadata = { title: "Kesehatan" };

export default async function KesehatanPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [summary, rows, categories] = await Promise.all([
    user.employeeId ? getHealthSummary(prisma, user.employeeId) : null,
    listHealthClaims(prisma, user),
    listHealthCategories(prisma),
  ]);
  // Pilihan ekspor: klaim yang menunggu / disetujui (draft & yang ditolak tidak ikut; yang diajukan selalu bernomor & bertanggal).
  const exportItems: ExportItem[] = rows.flatMap((row) =>
    (row.status === "PENDING" || row.status === "APPROVED") && row.number && row.claimDate
      ? [
          {
            id: row.id,
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            title: row.number,
            subtitle: `${formatDate(`${row.claimDate}T00:00:00Z`, "short")} · ${row.categoryName}${row.items.length > 1 ? ` (${row.items.length} baris)` : ""}`,
            amount: row.approvedAmount ?? row.amount,
            month: row.claimDate.slice(0, 7),
            status: row.status,
            currentLevel: row.currentLevel,
          },
        ]
      : [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kesehatan & Plafon"
        description={isAdmin ? "Klaim kesehatan Anda dan seluruh karyawan." : "Ajukan klaim rawat jalan, obat-obatan, vitamin, atau kacamata."}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Kesehatan & Plafon" }]}
        actions={summary?.annual != null && <HealthClaimDialog categories={categories} remaining={summary.remaining} />}
      />
      <KesehatanTabs active="klaim" isAdmin={isAdmin} />
      {summary && <HealthSummaryCard summary={summary} />}

      {/* Ekspor (2026-11-09): pilih karyawan → pilih klaim (filter bulan / semua) → PDF / Excel. Rekap bulanan & panel
          gabungan dihapus 2026-11-23 (permintaan user: filter bulan di sini sudah cukup). */}
      <ExportSelector
        items={exportItems}
        allowAllEmployees={isAdmin}
        defaultEmployeeId={user.employeeId}
        noun="klaim"
        pdfPath="/cetak/kesehatan"
        excelPath="/api/export/kesehatan"
      />
      <HealthClaimTable rows={rows} showRequester={isAdmin} revise={summary?.annual != null ? { categories, remaining: summary.remaining } : undefined} />
    </div>
  );
}
