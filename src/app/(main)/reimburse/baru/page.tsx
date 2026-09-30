import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getReimbursementFormOptions } from "@/lib/services/reimbursement-queries";
import { emptyItem } from "../form-defaults";
import { ReimbursementForm } from "../reimbursement-form";

export const metadata: Metadata = { title: "Pengajuan Reimburse" };

export default async function ReimburseBaruPage() {
  const user = await requireUser();
  const employee = user.employeeId
    ? await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { division: true, status: true } })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengajuan Reimburse"
        description="Isi satu baris per transaksi. Tipe mengikuti divisi Anda; total dihitung otomatis."
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Reimburse", href: "/reimburse" }, { label: "Pengajuan Baru" }]}
      />
      {employee?.status === "ACTIVE" ? (
        <ReimbursementForm
          reimbursementId={null}
          defaultValues={{ note: "", items: [emptyItem()] }}
          options={await getReimbursementFormOptions(prisma, employee.division)}
        />
      ) : (
        <EmptyState title="Tidak bisa mengajukan" description="Akun Anda belum terhubung ke data karyawan aktif. Hubungi Admin." />
      )}
    </div>
  );
}
