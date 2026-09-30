// Master data di Setting (SET-05): tipe reimburse per divisi & kategori klaim kesehatan.
// Tidak ada hapus — data lama yang sudah dipakai pengajuan cukup dinonaktifkan.
import type { PrismaClient } from "@/generated/prisma/client";
import type { HealthCategoryInput, ReimburseTypeInput } from "@/lib/validators/project";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

/** Kode tipe dari nama: "Parkir & Tol" → "PARKIR_TOL". */
export function typeCodeFromName(name: string): string {
  return name
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function saveReimburseType(db: PrismaClient, actorId: string, typeId: string | null, input: ReimburseTypeInput) {
  return db.$transaction(async (tx) => {
    const duplicate = await tx.reimburseType.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, id: typeId ? { not: typeId } : undefined } });
    if (duplicate) throw new ServiceError("Nama tipe sudah ada", "name");
    const before = typeId ? await tx.reimburseType.findUnique({ where: { id: typeId } }) : null;
    if (typeId && !before) throw new ServiceError("Tipe reimburse tidak ditemukan");

    let after;
    if (before) {
      after = await tx.reimburseType.update({ where: { id: before.id }, data: input });
    } else {
      const code = typeCodeFromName(input.name);
      if (!code) throw new ServiceError("Nama tipe harus mengandung huruf atau angka", "name");
      if (await tx.reimburseType.findUnique({ where: { code } })) throw new ServiceError("Tipe dengan kode serupa sudah ada", "name");
      after = await tx.reimburseType.create({ data: { ...input, code } });
    }
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "ReimburseType", entityId: after.id, before, after });
    return after;
  });
}

export async function saveHealthCategory(db: PrismaClient, actorId: string, categoryId: string | null, input: HealthCategoryInput) {
  return db.$transaction(async (tx) => {
    const duplicate = await tx.healthCategory.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, id: categoryId ? { not: categoryId } : undefined } });
    if (duplicate) throw new ServiceError("Nama kategori sudah ada", "name");
    const before = categoryId ? await tx.healthCategory.findUnique({ where: { id: categoryId } }) : null;
    if (categoryId && !before) throw new ServiceError("Kategori tidak ditemukan");
    const after = before
      ? await tx.healthCategory.update({ where: { id: before.id }, data: input })
      : await tx.healthCategory.create({ data: input });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "HealthCategory", entityId: after.id, before, after });
    return after;
  });
}
