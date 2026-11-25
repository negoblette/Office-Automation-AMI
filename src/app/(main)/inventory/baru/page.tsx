import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { listRacks } from "@/lib/services/storage-rack";
import { AssetBatchForm } from "./asset-batch-form";

export const metadata: Metadata = { title: "Daftarkan Unit" };

/** Daftarkan beberapa unit milik AMI sekaligus (2026-11-25) — Admin & Operational (kelola unit). */
export default async function NewAssetsPage() {
  const { user } = await requireInventory("manage");
  const racks = await listRacks(prisma);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daftarkan Unit"
        description="Daftarkan beberapa unit milik AMI sekaligus, satu baris per unit. Serial number boleh dikosongkan."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo", href: "/inventory" }, { label: "Daftarkan Unit" }]}
      />
      <AssetBatchForm draftKey={`assets:${user.id}:baru`} racks={racks.map(({ id, name, columns, rows }) => ({ id, name, columns, rows }))} />
    </div>
  );
}
