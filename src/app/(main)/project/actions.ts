"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { assertCanAddCustomerProject, deleteCustomer, saveCustomer, saveProject, submitProjectExpense } from "@/lib/services/project";
import { customerSchema, projectExpenseSchema, projectSchema } from "@/lib/validators/project";

function revalidateProjects() {
  revalidatePath("/project", "layout");
  revalidatePath("/reimburse", "layout");
  revalidatePath("/approval");
}

const optionalId = z.string().min(1).nullable();
const id = z.string().min(1);

async function run(action: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await action();
    revalidateProjects();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Tambah customer: divisi Sales + Admin (2026-10-12); ubah: hanya Admin. Mengembalikan id untuk dipilih di form. */
export async function saveCustomerAction(customerId: string | null, values: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    if (!customerId) await assertCanAddCustomerProject(prisma, user);
    const saved = await saveCustomer(prisma, user.id, optionalId.parse(customerId), customerSchema.parse(values).name, { createOnly: user.role !== "ADMIN" });
    revalidateProjects();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => deleteCustomer(prisma, admin.id, id.parse(customerId)));
}

/** Tambah project: divisi Sales + Admin (2026-10-12, selalu aktif); ubah: hanya Admin. */
export async function saveProjectAction(projectId: string | null, values: unknown): Promise<ActionResult<{ id: string; customerId: string }>> {
  const user = await requireUser();
  try {
    if (!projectId) await assertCanAddCustomerProject(prisma, user);
    const saved = await saveProject(prisma, user.id, optionalId.parse(projectId), projectSchema.parse(values), { createOnly: user.role !== "ADMIN" });
    revalidateProjects();
    return { ok: true, data: { id: saved.id, customerId: saved.customerId } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Input expense project → approval (PRJ-02, PRJ-04). Email di-enqueue setelah commit. */
export async function submitProjectExpenseAction(projectId: string, values: unknown, reviseId?: string | null): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(async () => {
    const result = await submitProjectExpense(prisma, admin, id.parse(projectId), projectExpenseSchema.parse(values), optionalId.parse(reviseId ?? null) ?? undefined);
    await enqueueApprovalNotifications(prisma, result.notifications);
  });
}
