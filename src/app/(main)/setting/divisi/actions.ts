"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { saveDivision } from "@/lib/services/division";
import { divisionSchema } from "@/lib/validators/setting";

/** Tambah / ubah divisi (2026-10-12). Layout di-revalidate karena daftar divisi dimuat di sana. */
export async function saveDivisionAction(code: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveDivision(prisma, admin.id, z.string().min(1).nullable().parse(code), divisionSchema.parse(values));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
