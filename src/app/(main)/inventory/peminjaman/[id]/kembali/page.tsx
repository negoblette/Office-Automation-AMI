import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { getDemoLoanDetail } from "@/lib/services/demo-loan-queries";
import { listRacks } from "@/lib/services/storage-rack";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "Terima Pengembalian" };

/** Terima pengembalian unit pinjaman (Tahap 16.5) — Operational / Admin, hanya peminjaman yang sedang dipinjam. */
export default async function ReturnDemoLoanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("manage");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  if (loan.status !== "ON_LOAN") redirect(`/inventory/peminjaman/${loan.id}`);
  const racks = (await listRacks(prisma)).map(({ id: rackId, name, columns, rows }) => ({ id: rackId, name, columns, rows }));
  const today = toJakartaIsoDate();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Terima Pengembalian"
        description={`${loan.number} · ${loan.borrowerName}. Cek setiap unit, taruh kembali di rak, lalu Hardware Admission Form terbit.`}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Peminjaman", href: "/inventory/peminjaman" },
          { label: loan.number, href: `/inventory/peminjaman/${loan.id}` },
          { label: "Terima Pengembalian" },
        ]}
      />
      <ReturnForm
        loanId={loan.id}
        racks={racks}
        today={today}
        deliveredAt={loan.deliveredAt}
        units={loan.items.map((item) => ({ itemId: item.id, deviceName: item.deviceName, serialNo: item.serialNo, originalLocation: item.currentLocation }))}
        defaultValues={{
          returnedAt: today,
          returnedByName: "",
          note: "",
          // Kondisi sengaja kosong: setiap unit wajib dicek & dipilih kondisinya. Posisi bawaan = posisi semula unit.
          items: loan.items.map((item) => ({
            itemId: item.id,
            condition: "" as never,
            note: "",
            rackId: item.currentRackId ?? "",
            rackPosition: item.currentRackPosition ?? "",
          })),
        }}
      />
    </div>
  );
}
