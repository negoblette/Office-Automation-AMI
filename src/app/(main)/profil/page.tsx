import type { Metadata } from "next";
import { ProgressBar } from "@/components/shared/progress-bar";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { profileCompleteness } from "@/lib/employee-profile";
import { formatDate } from "@/lib/format";
import { DIVISION_LABEL, ROLE_LABEL } from "@/lib/labels";
import { getEmployeeFormValues } from "@/lib/services/employee-queries";
import { NoEmployeeRecord, ProfileShell } from "./profile-shell";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profil Saya" };

export default async function ProfilPage() {
  const user = await requireUser();
  const employee = user.employeeId ? await getEmployeeFormValues(prisma, user.employeeId) : null;

  return (
    <ProfileShell active="data-diri" title="Profil Saya" description="Lengkapi dan perbarui data diri Anda. Data ini dipakai untuk administrasi kantor.">
      {employee ? (
        <ProfileContent values={employee.values} />
      ) : (
        <NoEmployeeRecord />
      )}
    </ProfileShell>
  );
}

function ProfileContent({ values }: { values: NonNullable<Awaited<ReturnType<typeof getEmployeeFormValues>>>["values"] }) {
  const { email, division, role, startDate, ...selfValues } = values;
  const completeness = profileCompleteness(selfValues);

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-4xl rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Kelengkapan Data Diri</h2>
          <span className="text-sm font-medium tabular-nums">{completeness.percent}%</span>
        </div>
        <ProgressBar value={completeness.percent} tone={completeness.percent === 100 ? "success" : "warning"} />
        <p className="mt-3 text-sm text-muted-foreground">
          {completeness.missing.length ? `Belum diisi: ${completeness.missing.join(", ")}.` : "Data diri Anda sudah lengkap."}
        </p>
      </section>
      <ProfileForm
        defaultValues={selfValues}
        readOnly={{
          email,
          division: DIVISION_LABEL[division],
          role: ROLE_LABEL[role],
          startDate: startDate ? formatDate(`${startDate}T00:00:00Z`) : "—",
        }}
      />
    </div>
  );
}
