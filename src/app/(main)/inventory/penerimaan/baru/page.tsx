import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { getGoodsReceiptFormOptions } from "@/lib/services/goods-receipt-queries";
import { listRacks } from "@/lib/services/storage-rack";
import { ReceiptForm } from "../receipt-form";

export const metadata: Metadata = { title: "Terima Barang" };

/** Catat barang masuk dari principal / distributor (2026-11-20) — HANYA Operational (Admin tidak otomatis). */
export default async function NewGoodsReceiptPage() {
  const { user } = await requireInventory("operate");
  const [options, racks] = await Promise.all([getGoodsReceiptFormOptions(prisma), listRacks(prisma)]);
  const today = toJakartaIsoDate();
  // Penerima bawaan = Operational yang mencatat (bila punya data karyawan aktif).
  const receiverId = options.employees.find((option) => option.value === user.employeeId)?.value ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Terima Barang"
        description="Catat barang yang dipinjam AMI dari principal / distributor. Unit langsung terdaftar di Daftar Unit dan Hardware Admission Form terbit."
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Penerimaan Barang", href: "/inventory/penerimaan" },
          { label: "Terima Barang" },
        ]}
      />
      <ReceiptForm
        draftKey={`receipt:${user.id}:baru`}
        today={today}
        options={options}
        racks={racks.map(({ id, name, columns, rows }) => ({ id, name, columns, rows }))}
        defaultValues={{
          ownership: "PRINCIPAL",
          ownerName: "",
          contactName: "",
          receivedDate: today,
          picId: "",
          receiverId,
          senderName: "",
          purpose: "",
          units: [{ deviceName: "", quantity: 1, serials: "", category: "DEMO_UNIT", rackId: "", rackPosition: "", notes: "" }],
        }}
      />
    </div>
  );
}
