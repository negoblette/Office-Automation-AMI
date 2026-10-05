import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getReimbursementDetail, getReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { itemsToVisits } from "@/lib/validators/reimbursement";
import { ReimbursementForm } from "../../reimbursement-form";

export const metadata: Metadata = { title: "Edit Draft Reimburse" };

export default async function EditReimbursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getReimbursementDetail(prisma, id);
  if (!detail) notFound();
  // Hanya pemohon yang boleh mengubah, dan hanya selama masih DRAFT.
  if (detail.employeeId !== user.employeeId || detail.status !== "DRAFT") redirect(`/reimburse/${id}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit Draft Reimburse"
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse", href: "/reimburse" }, { label: "Draft", href: `/reimburse/${id}` }, { label: "Edit" }]}
      />
      <ReimbursementForm
        reimbursementId={id}
        options={await getReimbursementFormOptions(prisma, detail.division)}
        defaultValues={{
          note: detail.note ?? "",
          visits: itemsToVisits(detail.items).map((visit) => ({
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
