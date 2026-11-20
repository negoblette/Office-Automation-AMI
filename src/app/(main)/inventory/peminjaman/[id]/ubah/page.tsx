import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { isEditableLoanStatus } from "@/lib/demo-loan";
import { getDemoLoanDetail, getLoanFormOptions } from "@/lib/services/demo-loan-queries";
import { LoanForm } from "../../loan-form";

export const metadata: Metadata = { title: "Ubah Pengajuan Peminjaman" };

/** Pemohon mengubah pengajuan yang belum disetujui; yang ditolak diajukan ulang (Fase 16.2). */
export default async function EditDemoLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireInventory("view");
  const { id } = await params;
  const loan = await getDemoLoanDetail(prisma, id);
  if (!loan) notFound();
  // Bukan pemohon / sudah disetujui atau dibatalkan → kembali ke detail (aksi juga dicek di server).
  if (loan.requesterId !== user.id || !isEditableLoanStatus(loan.status) || loan.approval.partlyApproved) redirect(`/inventory/peminjaman/${loan.id}`);

  const rejected = loan.status === "REJECTED";
  const options = await getLoanFormOptions(prisma, loan.id);
  const title = rejected ? "Revisi Pengajuan" : "Ubah Pengajuan";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={`${loan.number} · peminjaman ke ${loan.borrowerName}. ${rejected ? "Setelah disimpan, pengajuan diajukan ulang dan approval dimulai lagi dari awal." : "Perubahan langsung terlihat oleh approver."}`}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Peminjaman", href: "/inventory/peminjaman" },
          { label: loan.borrowerName, href: `/inventory/peminjaman/${loan.id}` },
          { label: rejected ? "Revisi" : "Ubah" },
        ]}
      />
      {rejected && loan.approval.rejection && (
        <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-red-soft px-5 py-4 text-sm text-red-deep">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-semibold">Alasan ditolak ({loan.approval.rejection.by}):</span> {loan.approval.rejection.reason}
          </span>
        </p>
      )}
      <LoanForm
        loanId={loan.id}
        resubmit={rejected}
        draftKey={`loan:v2:${user.id}:${loan.id}`}
        options={options}
        defaultValues={{
          purpose: loan.purpose,
          purposeDetail: loan.purposeDetail ?? "",
          assetIds: loan.items.map((item) => item.assetId),
          borrowerName: loan.borrowerName,
          contactName: loan.contactName,
          contactEmail: loan.contactEmail,
          // PIC lama yang sudah tidak memenuhi syarat (bukan Engineer / Sales aktif) harus dipilih ulang.
          picId: options.pics.some((option) => option.value === loan.picId) ? loan.picId : "",
          startDate: loan.startDate,
          dueDate: loan.dueDate,
          remarks: loan.remarks ?? "",
        }}
      />
    </div>
  );
}
