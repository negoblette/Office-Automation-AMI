"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { deleteEmployeeAsset, saveEmployeeAsset } from "@/lib/services/employee-asset";
import { employeeAssetSchema } from "@/lib/validators/employee-asset";

const id = z.string().min(1);

function revalidateAssets() {
  revalidatePath("/karyawan", "layout");
  revalidatePath("/profil/aset");
}

export async function saveEmployeeAssetAction(employeeId: string, assetId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveEmployeeAsset(prisma, admin.id, id.parse(employeeId), id.nullable().parse(assetId), employeeAssetSchema.parse(values));
    revalidateAssets();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteEmployeeAssetAction(assetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await deleteEmployeeAsset(prisma, admin.id, id.parse(assetId));
    revalidateAssets();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
