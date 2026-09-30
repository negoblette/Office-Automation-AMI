import { AlertTriangle, Boxes, PackageCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { activeEmployeeOptions, listAssets } from "@/lib/services/asset-queries";
import { AssetFormDialog } from "./asset-dialogs";
import { InventoryTable } from "./inventory-table";

export const metadata: Metadata = { title: "Inventory / Demo Unit" };

export default async function InventoryPage() {
  await requireAdmin();
  const [rows, employees] = await Promise.all([listAssets(prisma), activeEmployeeOptions(prisma)]);
  const assigned = rows.filter((r) => r.holder).length;
  const expiring = rows.filter((r) => [r.supportStatus, r.warrantyStatus].some((s) => s === "EXPIRING" || s === "EXPIRED")).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory & Demo Unit"
        description="Katalog perangkat kantor dan unit demo, serah terima ke karyawan, serta masa support & warranty."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventory / Demo Unit" }]}
        actions={<AssetFormDialog />}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total unit" value={rows.length} unit="perangkat" icon={Boxes} />
        <StatCard label="Dipinjam" value={assigned} unit="unit" icon={Users} tone="info" />
        <StatCard label="Tersedia" value={rows.length - assigned} unit="unit" icon={PackageCheck} tone="success" />
        <StatCard
          label="Support / warranty"
          value={expiring}
          unit="unit"
          icon={AlertTriangle}
          tone={expiring ? "danger" : "neutral"}
          footer="Berakhir atau ≤ 30 hari lagi"
        />
      </div>
      <InventoryTable rows={rows} employees={employees} />
    </div>
  );
}
