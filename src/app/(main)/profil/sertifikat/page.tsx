import type { Metadata } from "next";
import { CertificatesPanel } from "@/components/employee/certificates-panel";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getEmployeeCertificates } from "@/lib/services/employee-queries";
import { NoEmployeeRecord, ProfileShell } from "../profile-shell";

export const metadata: Metadata = { title: "Sertifikat & Ijazah" };

export default async function ProfilSertifikatPage() {
  const user = await requireUser();

  return (
    <ProfileShell
      active="sertifikat"
      title="Sertifikat & Ijazah"
      description="Sertifikat profesional dan ijazah Anda. Admin mendapat pengingat sebelum sertifikat kadaluarsa."
    >
      {user.employeeId ? (
        <CertificatesPanel
          employeeId={user.employeeId}
          certificates={await getEmployeeCertificates(prisma, user.employeeId)}
          canEdit
          canEditVerified={user.role === "ADMIN"}
        />
      ) : (
        <NoEmployeeRecord />
      )}
    </ProfileShell>
  );
}
