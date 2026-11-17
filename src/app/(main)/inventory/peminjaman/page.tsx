import { Inbox, PackageCheck, Plus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { STAT_GRID, StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { listDemoLoans } from "@/lib/services/demo-loan-queries";
import { LoanTable } from "./loan-table";

export const metadata: Metadata = { title: "Peminjaman Unit" };

/** Peminjaman unit demo ke perusahaan lain / Product Trial Form (Fase 16.2). */
export default async function DemoLoansPage() {
  const { user, access } = await requireInventory("view");
  const rows = await listDemoLoans(prisma);
  const pending = rows.filter((row) => row.status === "PENDING").length;
  const prepared = rows.filter((row) => row.status === "APPROVED").length;
  const onLoan = rows.filter((row) => row.status === "ON_LOAN").length;
  const overdue = rows.filter((row) => row.overdue).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Peminjaman Unit"
        description="Pinjamkan unit demo ke perusahaan lain lewat Product Trial Form: ajukan (Backup Unit / POC), disetujui Ko Yosep, lalu Operational menyiapkan barang & mencetak form."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo", href: "/inventory" }, { label: "Peminjaman" }]}
        actions={
          <Link href="/inventory/peminjaman/baru" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> Ajukan Peminjaman
          </Link>
        }
      />
      <div className={`${STAT_GRID} lg:grid-cols-3`}>
        <StatCard label="Menunggu approval" value={pending} unit="pengajuan" icon={Inbox} tone={pending ? "warning" : "neutral"} footer="Di Approval Center" />
        <StatCard
          label="Disiapkan"
          value={prepared}
          unit="form"
          icon={PackageCheck}
          tone={prepared ? "info" : "neutral"}
          footer={access.canManage ? "Disetujui — siapkan barang & cetak form" : "Disetujui, disiapkan Operational"}
        />
        <StatCard
          label="Dipinjam"
          value={onLoan}
          unit="form"
          icon={Truck}
          tone={overdue ? "danger" : "neutral"}
          footer={overdue ? `${overdue} lewat jatuh tempo` : "Sudah diantar ke peminjam"}
        />
      </div>
      <LoanTable rows={rows} userId={user.id} canPrepare={access.canManage} />
    </div>
  );
}
