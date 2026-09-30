"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { deleteFlow, saveFlow, setFlowActive } from "@/lib/services/approval-flow";
import { approvalFlowSchema, fallbackFlowSchema } from "@/lib/validators/setting";

const id = z.string().min(1);

/** Tambah flow REGULAR (flowId null) atau ubah flow; FALLBACK hanya step-nya. */
export async function saveFlowAction(flowId: string | null, isFallback: boolean, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const input = z.boolean().parse(isFallback) ? fallbackFlowSchema.parse(values) : approvalFlowSchema.parse(values);
    await saveFlow(prisma, admin.id, id.nullable().parse(flowId), input);
    revalidatePath("/setting/approval");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setFlowActiveAction(flowId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setFlowActive(prisma, admin.id, id.parse(flowId), z.boolean().parse(isActive));
    revalidatePath("/setting/approval");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteFlowAction(flowId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await deleteFlow(prisma, admin.id, id.parse(flowId));
    revalidatePath("/setting/approval");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
