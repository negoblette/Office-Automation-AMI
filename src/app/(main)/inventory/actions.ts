"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { createAssets, deleteAsset, updateAsset } from "@/lib/services/asset";
import { inventoryAccess } from "@/lib/services/inventory-access";
import { assetBatchSchema, assetSchema } from "@/lib/validators/asset";

function revalidateInventory() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/karyawan", "layout");
  revalidatePath("/profil/aset");
}

/** Kelola unit = Admin & Operational (2026-11-17); dicek di server untuk setiap aksi. */
async function run(action: (actorId: string) => Promise<unknown>): Promise<ActionResult> {
  const user = await requireUser();
  if (!inventoryEnabled(user)) return { ok: false, error: "Modul Inventaris sedang ditunda." };
  if (!(await inventoryAccess(prisma, user)).canManage) return { ok: false, error: "Hanya Admin & Operational yang bisa mengelola unit." };
  try {
    await action(user.id);
    revalidateInventory();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

const id = (value: string) => z.string().min(1).parse(value);

/** Ubah satu unit (INV-01, dialog Ubah Unit). */
export async function updateAssetAction(assetId: string, values: unknown): Promise<ActionResult> {
  return run((actorId) => updateAsset(prisma, actorId, id(assetId), assetSchema.parse(values)));
}

/** Daftarkan Unit berbaris (2026-11-25): beberapa unit milik AMI sekaligus; semua tersimpan atau tidak sama sekali. */
export async function createAssetsAction(values: unknown): Promise<ActionResult<{ count: number }>> {
  let count = 0;
  const result = await run(async (actorId) => {
    count = (await createAssets(prisma, actorId, assetBatchSchema.parse(values))).length;
  });
  return result.ok ? { ok: true, data: { count } } : result;
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  return run((actorId) => deleteAsset(prisma, actorId, id(assetId)));
}

// Serah terima unit ke karyawan (INV-02) tidak dipakai lagi (2026-11-17): unit dipinjamkan ke perusahaan lain lewat
// Product Trial Form. Aksinya dihapus; service & data lama (`AssetAssignment`) tetap ada untuk riwayat.
