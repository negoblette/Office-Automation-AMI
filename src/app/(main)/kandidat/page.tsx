import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listCandidates } from "@/lib/services/candidate-queries";
import { CandidateTable } from "./candidate-table";
import { CandidateDialog } from "./candidate-ui";

export const metadata: Metadata = { title: "Kandidat" };

export default async function KandidatPage() {
  await requireAdmin();
  const rows = await listCandidates(prisma);
  const inProcess = rows.filter((r) => r.status === "APPLIED" || r.status === "INTERVIEW").length;
  const accepted = rows.filter((r) => r.status === "ACCEPTED" && !r.convertedEmployeeId).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kandidat & Rekrutmen"
        description="Data & dokumen pelamar. Kandidat Diterima bisa dijadikan karyawan tanpa input ulang."
        breadcrumbs={[{ label: "SDM" }, { label: "Kandidat" }]}
        actions={<CandidateDialog />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total kandidat" value={rows.length} icon={UserPlus} />
        <StatCard label="Dalam proses" value={inProcess} tone="info" footer="Melamar & interview" />
        <StatCard label="Diterima, belum jadi karyawan" value={accepted} tone={accepted ? "warning" : "success"} />
      </div>
      <CandidateTable rows={rows} />
    </div>
  );
}
