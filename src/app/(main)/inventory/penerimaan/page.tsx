import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { listGoodsReceipts } from "@/lib/services/goods-receipt-queries";
import { ReceiptTable } from "./receipt-table";

export const metadata: Metadata = { title: "Penerimaan Barang" };

/**
 * Penerimaan Barang (2026-11-20): barang yang dipinjam AMI dari principal / distributor. Semua user Inventaris boleh
 * melihat (asal unit titipan); yang mencatat (Terima Barang → HAF) hanya Operational.
 */
export default async function GoodsReceiptsPage() {
  const { access } = await requireInventory("view");
  const rows = await listGoodsReceipts(prisma);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Penerimaan Barang"
        description="Barang yang dipinjam AMI dari principal / distributor. Setiap kedatangan dicatat Operational dan menerbitkan Hardware Admission Form (HAF); unitnya langsung masuk Daftar Unit."
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo", href: "/inventory" }, { label: "Penerimaan Barang" }]}
        actions={
          access.isOperational ? (
            <Link href="/inventory/penerimaan/baru" className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden /> Terima Barang
            </Link>
          ) : undefined
        }
      />
      <ReceiptTable rows={rows} />
    </div>
  );
}
