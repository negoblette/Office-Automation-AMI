import type { Metadata } from "next";
import { PersonalDocumentsPanel } from "@/components/employee/documents-panel";
import { FamilyPanel } from "@/components/employee/family-panel";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getEmployeeDocuments } from "@/lib/services/employee-queries";
import { NoEmployeeRecord, ProfileShell } from "../profile-shell";

export const metadata: Metadata = { title: "Dokumen & Keluarga" };

export default async function ProfilDokumenPage() {
  const user = await requireUser();
  // employeeId dari session — staf hanya bisa melihat & mengelola dokumennya sendiri.
  const documents = user.employeeId ? await getEmployeeDocuments(prisma, user.employeeId) : null;

  return (
    <ProfileShell
      active="dokumen"
      title="Dokumen & Keluarga"
      description="Upload dokumen pribadi dan data keluarga Anda. File hanya bisa dilihat oleh Anda dan Admin."
    >
      {documents ? (
        <div className="flex flex-col gap-6">
          <PersonalDocumentsPanel data={documents} canEdit />
          <h2 className="text-lg font-semibold">Keluarga</h2>
          <FamilyPanel data={documents} canEdit />
        </div>
      ) : (
        <NoEmployeeRecord />
      )}
    </ProfileShell>
  );
}
