import { CircleAlert, ClipboardCheck, Inbox, PackageCheck, Plus, Truck } from "lucide-react";
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
  const pickup = rows.filter((row) => row.status === "PICKUP").length;
  const followUp = rows.filter((row) => row.status === "FOLLOW_UP").length;
  const overdue = rows.filter((row) => row.overdue).length;
  // Langkah Operational hanya untuk user yang ditunjuk Operational (Admin tidak otomatis, 2026-11-19).
  const isOperational = access.isOperational;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Peminjaman Unit"
        description="Pinjamkan unit demo ke perusahaan lain lewat Product Trial Form: ajukan (Backup Unit / POC), disetujui Ko Yosep, Operational menyiapkan & mengantar barang, lalu menjadwalkan pengambilan (HAF) dan mengecek unit saat tiba."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo", href: "/inventory" }, { label: "Peminjaman" }]}
        actions={
          <Link href="/inventory/peminjaman/baru" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> Ajukan Peminjaman
          </Link>
        }
      />
      <div className={`${STAT_GRID} ${followUp ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatCard label="Menunggu approval" value={pending} unit="pengajuan" icon={Inbox} tone={pending ? "warning" : "neutral"} footer="Di Approval Center" />
        <StatCard
          label="Disiapkan"
          value={prepared}
          unit="form"
          icon={PackageCheck}
          tone={prepared ? "info" : "neutral"}
          footer={isOperational ? "Disetujui — siapkan barang & cetak form" : "Disetujui, disiapkan Operational"}
        />
        <StatCard
          label="Dipinjam"
          value={onLoan}
          unit="form"
          icon={Truck}
          tone={overdue ? "danger" : "neutral"}
          footer={overdue ? `${overdue} lewat jatuh tempo` : "Sudah diantar ke peminjam"}
        />
        <StatCard
          label="Pengambilan"
          value={pickup}
          unit="form"
          icon={ClipboardCheck}
          tone={pickup ? "info" : "neutral"}
          footer={isOperational ? "HAF terbit — cek unit saat tiba" : "Diambil kurir, menunggu dicek"}
        />
        {/* Unit kembali rusak / tidak lengkap & belum diselesaikan (2026-11-20) — hanya tampil bila ada. */}
        {followUp > 0 && (
          <StatCard
            label="Tindak lanjut"
            value={followUp}
            unit="form"
            icon={CircleAlert}
            tone="danger"
            footer={isOperational ? "Unit rusak / tidak lengkap — selesaikan" : "Unit rusak / tidak lengkap"}
          />
        )}
      </div>
      <LoanTable rows={rows} userId={user.id} isOperational={isOperational} />
    </div>
  );
}
