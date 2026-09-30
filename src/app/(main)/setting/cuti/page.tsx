import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getLeaveSettings } from "@/lib/services/leave-queries";
import { LeaveSettingsForm } from "./leave-settings-form";

export const metadata: Metadata = { title: "Jatah Cuti & Carry Over" };

export default async function SettingCutiPage() {
  await requireAdmin();
  const settings = await getLeaveSettings(prisma);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jatah Cuti & Carry Over"
        description="Perubahan berlaku untuk saldo periode cuti yang baru terbentuk; saldo yang sudah ada tidak berubah."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Jatah Cuti" }]}
      />
      <LeaveSettingsForm
        defaultValues={{
          policies: settings.policies.map((p) => ({ minYears: p.minYears, maxYears: p.maxYears ?? "", days: p.days })),
          maxCarryOver: settings.maxCarryOver,
        }}
      />
    </div>
  );
}
