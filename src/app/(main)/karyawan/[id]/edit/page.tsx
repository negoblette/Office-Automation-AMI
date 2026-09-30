import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getEmployeeFormValues } from "@/lib/services/employee-queries";
import { EditEmployeeForm } from "./edit-employee-form";

export const metadata: Metadata = { title: "Edit Karyawan" };

export default async function EditKaryawanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const employee = await getEmployeeFormValues(prisma, id);
  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit ${employee.values.fullName}`}
        description="Admin dapat mengubah semua data, termasuk divisi, role, email login, dan tanggal masuk."
        breadcrumbs={[
          { label: "SDM" },
          { label: "Karyawan & Dokumen", href: "/karyawan" },
          { label: employee.values.fullName, href: `/karyawan/${employee.id}` },
          { label: "Edit" },
        ]}
      />
      <EditEmployeeForm employeeId={employee.id} defaultValues={employee.values} />
    </div>
  );
}
