import { AlertTriangle, Archive, Boxes, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { STAT_GRID, StatCard } from "@/components/shared/stat-card";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { listAssets } from "@/lib/services/asset-queries";
import { listRacks } from "@/lib/services/storage-rack";
import { AssetFormDialog } from "./asset-dialogs";
import { InventoryTable } from "./inventory-table";

export const metadata: Metadata = { title: "Inventaris / Unit Demo" };

export default async function InventoryPage() {
  const { access } = await requireInventory("view");
  const [rows, racks] = await Promise.all([listAssets(prisma), listRacks(prisma)]);
  const inRack = rows.filter((r) => r.rackPosition).length;
  // Unit titipan principal / distributor (bukan milik AMI).
  const consigned = rows.filter((r) => r.ownership !== "AMI").length;
  const expiring = rows.filter((r) => [r.supportStatus, r.warrantyStatus].some((s) => s === "EXPIRING" || s === "EXPIRED")).length;
  const rackOptions = racks.map(({ id, name, columns, rows: rackRows }) => ({ id, name, columns, rows: rackRows }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventaris & Unit Demo"
        description="Katalog unit demo & perangkat kantor, lokasi rak di gudang, serta masa support & warranty."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo" }]}
        actions={access.canManage ? <AssetFormDialog racks={rackOptions} /> : undefined}
      />
      <div className={`${STAT_GRID} xl:grid-cols-4`}>
        <StatCard
          label="Total unit"
          value={rows.length}
          unit="perangkat"
          icon={Boxes}
          footer={`${rows.length - consigned} milik AMI · ${consigned} principal / distributor`}
        />
        <StatCard label="Di rak" value={inRack} unit="unit" icon={Archive} tone="success" />
        <StatCard
          label="Tidak di rak"
          value={rows.length - inRack}
          unit="unit"
          icon={PackageSearch}
          tone={rows.length - inRack ? "warning" : "neutral"}
          footer="Belum dicatat posisinya"
        />
        <StatCard
          label="Support / warranty"
          value={expiring}
          unit="unit"
          icon={AlertTriangle}
          tone={expiring ? "danger" : "neutral"}
          footer="Berakhir atau ≤ 30 hari lagi"
        />
      </div>
      <InventoryTable rows={rows} racks={rackOptions} canManage={access.canManage} />
    </div>
  );
}
