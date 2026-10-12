import type { Metadata } from "next";
import { EmployeeAssetsPanel } from "@/components/employee/employee-assets-panel";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listEmployeeAssetItems } from "@/lib/services/employee-asset";
import { NoEmployeeRecord, ProfileShell } from "../profile-shell";

export const metadata: Metadata = { title: "Inventory Kantor" };

export default async function ProfilAsetPage() {
  const user = await requireUser();
  return (
    <ProfileShell active="aset" title="Inventory Kantor" description={user.role === "ADMIN" ? "Barang kantor yang sedang atau pernah Anda pegang." : "Barang kantor yang sedang atau pernah Anda pegang. Dicatat oleh Admin."}>
      {user.employeeId ? (
        <EmployeeAssetsPanel employeeId={user.employeeId} assets={await listEmployeeAssetItems(prisma, user.employeeId)} canEdit={user.role === "ADMIN"} />
      ) : (
        <NoEmployeeRecord />
      )}
    </ProfileShell>
  );
}
