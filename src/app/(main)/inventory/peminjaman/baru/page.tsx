import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { defaultLoanEnd } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import { getLoanFormOptions } from "@/lib/services/demo-loan-queries";
import { LoanForm } from "../loan-form";

export const metadata: Metadata = { title: "Ajukan Peminjaman Unit" };

/** Pengajuan peminjaman unit (Fase 16.2). `?unit=<id>` = unit sudah dipilih (dari halaman detail unit). */
export default async function NewDemoLoanPage({ searchParams }: { searchParams: Promise<{ unit?: string | string[] }> }) {
  const { user } = await requireInventory("view");
  const [options, params] = await Promise.all([getLoanFormOptions(prisma), searchParams]);
  const unitId = typeof params.unit === "string" ? params.unit : undefined;
  const preselected = options.units.find((unit) => unit.id === unitId && !unit.unavailable);
  // Pemohon dari divisi Sales otomatis menjadi Sales Person (masih bisa diganti).
  const salesPersonId = options.salesPeople.find((option) => option.value === user.employeeId)?.value ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ajukan Peminjaman Unit"
        description="Isi data peminjaman. Pengajuan disetujui lewat Approval (Ko Yosep), lalu Operational menyiapkan barang dan mencetak Product Trial Form."
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Peminjaman", href: "/inventory/peminjaman" },
          { label: "Ajukan" },
        ]}
      />
      <LoanForm
        loanId={null}
        draftKey={`loan:${user.id}:baru`}
        options={options}
        defaultValues={{
          purpose: "",
          purposeDetail: "",
          assetIds: preselected ? [preselected.id] : [],
          borrowerName: "",
          picName: "",
          picEmail: "",
          salesPersonId,
          startDate: toJakartaIsoDate(),
          dueDate: defaultLoanEnd(toJakartaIsoDate()),
          remarks: "",
        }}
      />
    </div>
  );
}
