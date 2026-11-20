import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { getGoodsReceipt, getGoodsReceiptFormOptions } from "@/lib/services/goods-receipt-queries";
import { ReturnGoodsForm } from "./return-goods-form";

export const metadata: Metadata = { title: "Kembalikan Barang" };

/** Kembalikan barang pinjaman ke principal / distributor (2026-11-20) — HANYA Operational (Admin tidak otomatis). */
export default async function ReturnGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireInventory("operate");
  const { id } = await params;
  const [receipt, options] = await Promise.all([getGoodsReceipt(prisma, id), getGoodsReceiptFormOptions(prisma)]);
  if (!receipt) notFound();
  // Unit yang masih di AMI (yang sedang dipakai ditampilkan tapi belum bisa dipilih).
  const units = receipt.units
    .filter((unit) => unit.status.kind === "AVAILABLE" || unit.status.kind === "BUSY")
    .map((unit) => ({
      id: unit.id,
      deviceName: unit.deviceName,
      serialNo: unit.serialNo,
      location: unit.location,
      busy: unit.status.kind === "BUSY" ? unit.status.label : null,
    }));
  if (!units.some((unit) => !unit.busy)) redirect(`/inventory/penerimaan/${receipt.id}`);
  const today = toJakartaIsoDate();
  const returnedById = options.employees.find((option) => option.value === user.employeeId)?.value ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kembalikan ke ${receipt.ownerName}`}
        description={`Barang yang dipinjam AMI lewat ${receipt.hafNumber}. Unit yang dikembalikan keluar dari Daftar Unit dan Hardware Admission Form pengembalian terbit.`}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Penerimaan Barang", href: "/inventory/penerimaan" },
          { label: receipt.hafNumber, href: `/inventory/penerimaan/${receipt.id}` },
          { label: "Kembalikan" },
        ]}
      />
      <ReturnGoodsForm
        receiptId={receipt.id}
        ownerName={receipt.ownerName}
        units={units}
        employees={options.employees}
        minDate={receipt.receivedDate}
        today={today}
        defaultValues={{ assetIds: [], returnedDate: today, contactName: receipt.contactName, returnedById, receivedByName: "", note: "" }}
      />
    </div>
  );
}
