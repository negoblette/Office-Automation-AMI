import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { CreateEmployeeForm } from "./create-employee-form";

export const metadata: Metadata = { title: "Tambah Karyawan" };

export default async function TambahKaryawanPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Karyawan"
        description="Buat akun dengan data minimal. Karyawan melengkapi data dirinya sendiri setelah login."
        breadcrumbs={[{ label: "SDM" }, { label: "Karyawan & Dokumen", href: "/karyawan" }, { label: "Tambah Karyawan" }]}
      />
      <CreateEmployeeForm />
    </div>
  );
}
