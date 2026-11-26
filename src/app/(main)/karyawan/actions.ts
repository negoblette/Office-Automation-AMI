"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { createEmployee, rehireEmployee, resignEmployee, updateByAdmin } from "@/lib/services/employee";
import { employeeAdminUpdateSchema, employeeCreateSchema, rehireSchema, resignSchema } from "@/lib/validators/employee";

/** Admin membuat akun karyawan minimal (Tech Spec §6.1). Akun Admin/Approver baru → alarm ke semua Admin (F2). */
export async function createEmployeeAction(values: unknown): Promise<ActionResult<{ employeeId: string }>> {
  const admin = await requireAdmin();
  try {
    const input = employeeCreateSchema.parse(values);
    const { employeeId, alert } = await createEmployee(prisma, admin.id, input, requestMeta(await headers()));
    // Email alarm di-enqueue SETELAH transaksi commit.
    await enqueueSecurityAlert(prisma, alert);
    revalidatePath("/karyawan");
    return { ok: true, data: { employeeId } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Admin mengubah data karyawan, termasuk divisi, role, email, dan tanggal masuk. Ubah role / email login → alarm (F2). */
export async function updateEmployeeAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const input = employeeAdminUpdateSchema.parse(values);
    const { alerts } = await updateByAdmin(prisma, admin.id, employeeId, input, requestMeta(await headers()));
    // Email alarm di-enqueue SETELAH transaksi commit.
    for (const alert of alerts) await enqueueSecurityAlert(prisma, alert);
    revalidateEmployee(employeeId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

function revalidateEmployee(employeeId: string) {
  revalidatePath("/karyawan");
  revalidatePath("/karyawan/arsip");
  revalidatePath(`/karyawan/${employeeId}`);
}

/** Resign (EMP-03): tutup periode aktif, status RESIGNED, akun nonaktif. */
export async function resignEmployeeAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const { endDate } = resignSchema.parse(values);
    await resignEmployee(prisma, admin.id, employeeId, endDate);
    revalidateEmployee(employeeId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Rehire dari Arsip (EMP-04): periode kerja baru pada record lama. */
export async function rehireEmployeeAction(employeeId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const { startDate } = rehireSchema.parse(values);
    await rehireEmployee(prisma, admin.id, employeeId, startDate);
    revalidateEmployee(employeeId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
