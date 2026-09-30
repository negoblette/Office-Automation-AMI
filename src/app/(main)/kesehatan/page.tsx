import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kesehatan & Plafon"
        description={isAdmin ? "Klaim kesehatan Anda dan seluruh karyawan." : "Ajukan klaim rawat jalan, vitamin, atau kacamata dengan invoice."}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Kesehatan & Plafon" }]}
        actions={summary?.annual != null && <HealthClaimDialog categories={categories} remaining={summary.remaining} />}
      />
      <KesehatanTabs active="klaim" isAdmin={isAdmin} />
      {summary && <HealthSummaryCard summary={summary} />}
      <HealthClaimTable rows={rows} showRequester={isAdmin} />
    </div>
  );
}
