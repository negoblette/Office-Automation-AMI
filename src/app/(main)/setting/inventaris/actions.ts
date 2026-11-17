"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { setTrialFormCounter } from "@/lib/services/demo-loan";
import { saveOperationalUsers } from "@/lib/services/inventory-access";
import { createRack, deleteRack, updateRack } from "@/lib/services/storage-rack";
import { trialFormCounterSchema } from "@/lib/validators/demo-loan";
import { operationalUsersSchema, rackSchema } from "@/lib/validators/inventory";

// Setting → Inventaris & Rak (2026-11-17), khusus Admin. Audit ditulis di service.
async function run(action: (actorId: string) => Promise<unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await action(admin.id);
    revalidatePath("/setting/inventaris");
    // Daftar Operational menentukan siapa yang melihat menu Inventory → seluruh shell perlu dihitung ulang.
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

const id = (value: string) => z.string().min(1).parse(value);

export async function saveOperationalUsersAction(values: unknown): Promise<ActionResult> {
  return run((actorId) => saveOperationalUsers(prisma, actorId, operationalUsersSchema.parse(values)));
}

/** `rackId` null = rak baru. */
export async function saveRackAction(rackId: string | null, values: unknown): Promise<ActionResult> {
  return run((actorId) => {
    const input = rackSchema.parse(values);
    return rackId ? updateRack(prisma, actorId, id(rackId), input) : createRack(prisma, actorId, input);
  });
}

export async function deleteRackAction(rackId: string): Promise<ActionResult> {
  return run((actorId) => deleteRack(prisma, actorId, id(rackId)));
}

/** Nomor terakhir Product Trial Form tahun ini (Fase 16.2), mis. melanjutkan nomor form manual. */
export async function saveTrialFormCounterAction(values: unknown): Promise<ActionResult> {
  return run((actorId) => setTrialFormCounter(prisma, actorId, trialFormCounterSchema.parse(values)));
}
