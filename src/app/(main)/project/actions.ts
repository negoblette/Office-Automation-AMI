"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { deleteCustomer, saveCustomer, saveProject, submitProjectExpense, submitProjectRevenue } from "@/lib/services/project";
import { customerSchema, projectExpenseSchema, projectRevenueSchema, projectSchema } from "@/lib/validators/project";

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

export async function saveCustomerAction(customerId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => saveCustomer(prisma, admin.id, optionalId.parse(customerId), customerSchema.parse(values).name));
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => deleteCustomer(prisma, admin.id, id.parse(customerId)));
}

export async function saveProjectAction(projectId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => saveProject(prisma, admin.id, optionalId.parse(projectId), projectSchema.parse(values)));
}

/** Input expense project → approval (PRJ-02, PRJ-04). Email di-enqueue setelah commit. */
export async function submitProjectExpenseAction(projectId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(async () => {
    const result = await submitProjectExpense(prisma, admin, id.parse(projectId), projectExpenseSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
  });
}

/** Input revenue project → approval (PRJ-04, OI-06). */
export async function submitProjectRevenueAction(projectId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(async () => {
    const result = await submitProjectRevenue(prisma, admin, id.parse(projectId), projectRevenueSchema.parse(values));
    await enqueueApprovalNotifications(prisma, result.notifications);
  });
}
