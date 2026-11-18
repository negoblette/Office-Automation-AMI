import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getHolidayNotifyUserIds, holidayNotifyRecipients } from "@/lib/services/holiday-sync";
import { getLeaveSettings } from "@/lib/services/leave-queries";
import { HolidayNotifyDialog } from "./holiday-notify-dialog";
import { LeaveSettingsForm } from "./leave-settings-form";

export const metadata: Metadata = { title: "Jatah Cuti & Carry Over" };

export default async function SettingCutiPage() {
  await requireAdmin();
  const [settings, notifyIds, recipients, users] = await Promise.all([
    getLeaveSettings(prisma),
    getHolidayNotifyUserIds(prisma),
    holidayNotifyRecipients(prisma),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, email: true, employee: { select: { fullName: true, position: true } } } }),
  ]);
  const options = users
    .map((user) => ({ value: user.id, label: user.employee ? `${user.employee.fullName}${user.employee.position ? ` — ${user.employee.position}` : ""}` : user.email }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));

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

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6" aria-labelledby="holiday-notify-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h2 id="holiday-notify-title" className="text-base font-semibold">
              Notifikasi perubahan libur
            </h2>
            <p className="text-sm text-muted-foreground">
              Kalender Libur mengikuti kalender libur nasional Google setiap hari. Bila ada libur yang ditambah, dipindah, atau dihapus, penerima di
              bawah diberi tahu (email & lonceng) beserta pengajuan cuti yang perlu dicek saldonya.
            </p>
          </div>
          <HolidayNotifyDialog selected={notifyIds} users={options} />
        </div>
        {notifyIds.length === 0 && (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">Belum diatur — sementara dikirim ke semua Admin aktif.</p>
        )}
        <ul className="flex flex-wrap gap-2" aria-label="Penerima saat ini">
          {recipients.map((user) => (
            <li key={user.id} className="rounded-full bg-panel px-3.5 py-1.5 text-sm font-semibold text-ink">
              {user.employee?.fullName ?? user.email}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
