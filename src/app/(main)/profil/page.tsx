import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { profileCompleteness } from "@/lib/employee-profile";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { getEmployeeFormValues } from "@/lib/services/employee-queries";
import { NoEmployeeRecord, ProfileShell } from "./profile-shell";
import { ProfileForm } from "./profile-form";
import { ProfileSpotlight } from "./profile-spotlight";
import { divisionLabels } from "@/lib/services/division";

export const metadata: Metadata = { title: "Profil Saya" };

export default async function ProfilPage() {
  const user = await requireUser();
  const employee = user.employeeId ? await getEmployeeFormValues(prisma, user.employeeId) : null;

  return (
    <ProfileShell
      active="data-diri"
      title="Profil Saya"
      description="Lengkapi dan perbarui data diri Anda. Data ini dipakai untuk administrasi kantor."
      employeeId={user.employeeId}
    >
      {employee ? (
        <ProfileContent
          values={employee.values}
          adminEditHref={user.role === "ADMIN" ? `/karyawan/${user.employeeId}/edit` : null}
        />
      ) : (
        <NoEmployeeRecord />
      )}
    </ProfileShell>
  );
}

async function ProfileContent({
  values,
  adminEditHref,
}: {
  values: NonNullable<Awaited<ReturnType<typeof getEmployeeFormValues>>>["values"];
  /** Admin: tautan untuk mengubah Akun & Pekerjaan miliknya sendiri. */
  adminEditHref: string | null;
}) {
  const { email, division, role, startDate, employeeNo, fullName, position, level, ...selfValues } = values;
  const completeness = profileCompleteness(selfValues);

  return (
    <div className="flex flex-col gap-6">
      <ProfileSpotlight name={fullName} position={position} email={email} roleLabel={ROLE_LABEL[role]} completeness={completeness} />
      <ProfileForm
        adminEditHref={adminEditHref}
        defaultValues={selfValues}
        readOnly={{
          email,
          division: (await divisionLabels(prisma))[division] ?? division,
          role: ROLE_LABEL[role],
          startDate: startDate ? formatDate(`${startDate}T00:00:00Z`) : "—",
          employeeNo: employeeNo || null,
          fullName,
          position,
          level: level || null,
        }}
      />
    </div>
  );
}
