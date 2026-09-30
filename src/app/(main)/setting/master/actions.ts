"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { saveHealthCategory, saveReimburseType } from "@/lib/services/master-data";
import { healthCategorySchema, reimburseTypeSchema } from "@/lib/validators/project";

const optionalId = z.string().min(1).nullable();

/** Tambah / ubah tipe reimburse per divisi (SET-05). */
export async function saveReimburseTypeAction(typeId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveReimburseType(prisma, admin.id, optionalId.parse(typeId), reimburseTypeSchema.parse(values));
    revalidatePath("/setting/master");
    revalidatePath("/reimburse", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Tambah / ubah kategori klaim kesehatan (SET-05). */
export async function saveHealthCategoryAction(categoryId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveHealthCategory(prisma, admin.id, optionalId.parse(categoryId), healthCategorySchema.parse(values));
    revalidatePath("/setting/master");
    revalidatePath("/kesehatan", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
