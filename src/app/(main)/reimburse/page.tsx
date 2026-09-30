import { CheckCheck, Clock, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { listReimbursements } from "@/lib/services/reimbursement-queries";
import { ReimbursementTable } from "./reimbursement-table";

export const metadata: Metadata = { title: "Reimburse" };

export default async function ReimbursePage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const rows = await listReimbursements(prisma, user);

  const thisMonth = toJakartaIsoDate().slice(0, 7);
  const submittedThisMonth = rows.filter((row) => row.submittedAt && toJakartaIsoDate(row.submittedAt).startsWith(thisMonth));
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

      <div className="grid gap-4 sm:grid-cols-3">
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
