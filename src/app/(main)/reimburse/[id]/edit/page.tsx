import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getReimbursementDetail, getReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { itemsToVisits } from "@/lib/validators/reimbursement";
import { ReimbursementForm } from "../../reimbursement-form";
import { canAddCustomerProject } from "@/lib/services/project";
import { canUseOvertime } from "@/lib/services/overtime";
import { listReimbursableOvertimes } from "@/lib/services/overtime-queries";

export const metadata: Metadata = { title: "Edit Draft Reimburse" };

export default async function EditReimbursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getReimbursementDetail(prisma, id);
  if (!detail) notFound();
  // Hanya pemohon yang boleh mengubah: selama DRAFT, atau setelah ditolak (revisi, 2026-10-12).
  if (detail.employeeId !== user.employeeId || (detail.status !== "DRAFT" && detail.status !== "REJECTED")) redirect(`/reimburse/${id}`);
  // Baris overtime (2026-10-30) tampil sebagai centang di bagian Overtime, bukan kunjungan.
  const overtimeIds = detail.items.flatMap((item) => (item.overtimeId ? [item.overtimeId] : []));
  const overtime = (await canUseOvertime(prisma, detail.employeeId)) || overtimeIds.length ? await listReimbursableOvertimes(prisma, detail.employeeId, id) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.status === "REJECTED" ? "Revisi Reimburse" : "Edit Draft Reimburse"}
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse", href: "/reimburse" }, { label: "Draft", href: `/reimburse/${id}` }, { label: "Edit" }]}
      />
      <ReimbursementForm
        reimbursementId={id}
        draftKey={`reimburse:${user.id}:${id}`}
        options={await getReimbursementFormOptions(prisma, detail.division, await canAddCustomerProject(prisma, user))}
        overtime={overtime}
        defaultValues={{
          note: detail.note ?? "",
          overtimeIds,
          visits: itemsToVisits(detail.items.filter((item) => !item.overtimeId)).map((visit) => ({
            ...visit,
            lines: visit.lines.map((item) => ({
              activity: item.activity,
              participants: item.participants,
              location: item.location,
              typeId: item.typeId,
              hasReceipt: item.hasReceipt,
              paymentMethod: item.paymentMethod,
              amount: item.amount,
            })),
          })),
        }}
      />
    </div>
  );
}
