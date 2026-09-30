import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignmentHistory } from "@/components/employee/assignment-history";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { listEmployeeAssets } from "@/lib/services/asset-queries";
import { NoEmployeeRecord, ProfileShell } from "../profile-shell";

export const metadata: Metadata = { title: "Inventory Saya" };

export default async function ProfilInventoryPage() {
  const user = await requireUser();
  if (!FEATURES.inventory) notFound();

  return (
    <ProfileShell active="inventory" title="Inventory Saya" description="Perangkat kantor dan unit demo yang sedang atau pernah Anda pegang (INV-03).">
      {user.employeeId ? <AssignmentHistory rows={await listEmployeeAssets(prisma, user.employeeId)} mode="employee" /> : <NoEmployeeRecord />}
    </ProfileShell>
  );
}
