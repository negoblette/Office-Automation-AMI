import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { canUseOvertime } from "@/lib/services/overtime";
import { listReimbursableOvertimes } from "@/lib/services/overtime-queries";
import { OvertimeReimbursementForm } from "../overtime-reimbursement-form";

export const metadata: Metadata = { title: "Reimburse Overtime" };

/** Reimburse Overtime (2026-10-30): pengajuan terpisah dari reimburse biasa; approval & nominal oleh Ci Ika. */
export default async function ReimburseOvertimePage() {
  const user = await requireUser();
  const allowed = await canUseOvertime(prisma, user.employeeId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reimburse Overtime"
        description="Pilih overtime yang sudah disetujui approver. Nominal tiap sesi diisi approver saat menyetujui pengajuan ini."
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse", href: "/reimburse" }, { label: "Reimburse Overtime" }]}
      />
      {allowed ? (
        <OvertimeReimbursementForm
          reimbursementId={null}
          defaultValues={{ note: "", overtimeIds: [] }}
          overtimes={await listReimbursableOvertimes(prisma, user.employeeId!, null)}
        />
      ) : (
        <EmptyState title="Tidak bisa mengajukan" description="Reimburse overtime hanya untuk karyawan aktif divisi Engineer." />
      )}
    </div>
  );
}
