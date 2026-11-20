import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { getDemoLoanDetail } from "@/lib/services/demo-loan-queries";
import { listRacks } from "@/lib/services/storage-rack";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "Pengecekan Unit" };

/**
 * Pengecekan Unit (Tahap 16.5, revisi 2026-11-19) — HANYA Operational yang ditunjuk (Admin tidak otomatis), untuk
 * peminjaman dalam pengambilan (HAF sudah terbit & barang dibawa kurir ke AMI), termasuk cek ulang setelah verifikasi
 * engineer ditolak (2026-11-20).
 */
export default async function ReturnDemoLoanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("operate");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  if (loan.status !== "PICKUP") redirect(`/inventory/peminjaman/${loan.id}`);
  const racks = (await listRacks(prisma)).map(({ id: rackId, name, columns, rows }) => ({ id: rackId, name, columns, rows }));
  const today = toJakartaIsoDate();
  // Verifikasi engineer ditolak (2026-11-20) → cek ulang: alasan ditampilkan, isian sebelumnya jadi isian awal.
  const rejection = loan.returnApproval.status === "REJECTED" ? loan.returnApproval.rejection : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengecekan Unit"
        description={`${loan.number} · ${loan.borrowerName}${loan.hafNumber ? ` · HAF ${loan.hafNumber}` : ""}. Barang sudah tiba di AMI: cek setiap unit, lalu taruh kembali di rak.`}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Peminjaman", href: "/inventory/peminjaman" },
          { label: loan.number, href: `/inventory/peminjaman/${loan.id}` },
          { label: "Pengecekan Unit" },
        ]}
      />
      {rejection && (
        <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-red-soft px-5 py-4 text-sm text-red-deep">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-semibold">Verifikasi ditolak {rejection.by}:</span> {rejection.reason}
            <span className="block pt-1">Cek ulang unit sesuai catatan di atas. Isian pengecekan sebelumnya sudah terisi — ubah yang perlu, lalu simpan lagi.</span>
          </span>
        </p>
      )}
      {loan.pickupDate && loan.pickupDate > today && (
        <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-amber-soft px-5 py-4 text-sm text-amber-deep">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0">
            Jadwal pengambilan di HAF {formatDate(`${loan.pickupDate}T00:00:00Z`, "short")} belum tiba. Bila barang sudah diambil lebih awal, ubah jadwal
            pengambilan dulu di halaman peminjaman.
          </span>
        </p>
      )}
      <ReturnForm
        loanId={loan.id}
        racks={racks}
        today={today}
        pickupDate={loan.pickupDate}
        units={loan.items.map((item) => ({ itemId: item.id, deviceName: item.deviceName, serialNo: item.serialNo, originalLocation: item.currentLocation }))}
        defaultValues={{
          returnedAt: rejection && loan.returnedAt ? loan.returnedAt : today,
          returnedByName: rejection ? (loan.returnedByName ?? "") : "",
          note: rejection ? (loan.returnNote ?? "") : "",
          // Cek pertama: kondisi sengaja kosong (setiap unit wajib dicek). Cek ulang: hasil cek sebelumnya. Posisi bawaan =
          // posisi unit sekarang (posisi semula, atau tempat ditaruh saat cek sebelumnya).
          items: loan.items.map((item) => ({
            itemId: item.id,
            condition: (rejection ? (item.returnCondition ?? "") : "") as never,
            note: rejection ? (item.returnNote ?? "") : "",
            rackId: item.currentRackId ?? "",
            rackPosition: item.currentRackPosition ?? "",
          })),
        }}
      />
    </div>
  );
}
