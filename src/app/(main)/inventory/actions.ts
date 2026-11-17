"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { createAsset, deleteAsset, updateAsset } from "@/lib/services/asset";
import { inventoryAccess } from "@/lib/services/inventory-access";
import { assetSchema } from "@/lib/validators/asset";

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

/** Daftarkan atau ubah aset (INV-01). `assetId` null = baru. */
export async function saveAssetAction(assetId: string | null, values: unknown): Promise<ActionResult> {
  return run((actorId) => {
    const input = assetSchema.parse(values);
    return assetId ? updateAsset(prisma, actorId, id(assetId), input) : createAsset(prisma, actorId, input);
  });
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  return run((actorId) => deleteAsset(prisma, actorId, id(assetId)));
}

// Serah terima unit ke karyawan (INV-02) tidak dipakai lagi (2026-11-17): unit dipinjamkan ke perusahaan lain lewat
// Product Trial Form. Aksinya dihapus; service & data lama (`AssetAssignment`) tetap ada untuk riwayat.
