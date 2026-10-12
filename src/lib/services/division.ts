// Divisi pekerjaan — master data (2026-10-12). Bawaan: Umum, Engineer, Sales, Direktur, HR, Finance;
// Admin bisa menambah di Setting → Divisi. Divisi tanpa alur approval sendiri memakai alur divisi
// acuannya (`followsCode`, default Umum) — lihat `buildApproval`.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { DivisionInput } from "@/lib/validators/setting";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

/** Divisi Direktur (cuti tanpa approval, tampil "Direktur cuti" di kalender). */
export const DIRECTOR_DIVISION = "DIRECTOR";
/** Acuan alur approval default untuk divisi baru. */
export const DEFAULT_FOLLOWS_DIVISION = "UMUM";

export async function listDivisions(db: Db, options: { includeInactive?: boolean } = {}) {
  return db.division.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Pilihan dropdown divisi aktif `{ value: code, label: name }`. */
export async function divisionOptions(db: Db) {
  return (await listDivisions(db)).map((d) => ({ value: d.code, label: d.name }));
}

/** Peta kode → nama untuk semua divisi (termasuk nonaktif, supaya data lama tetap terbaca). */
export async function divisionLabels(db: Db): Promise<Record<string, string>> {
  return Object.fromEntries((await listDivisions(db, { includeInactive: true })).map((d) => [d.code, d.name]));
}

/** Pastikan kode divisi ada & aktif (dipakai saat menyimpan karyawan, alur, tipe reimburse). */
export async function assertDivisions(db: Db, codes: (string | null | undefined)[]) {
  const wanted = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  if (!wanted.length) return;
  const found = await db.division.findMany({ where: { code: { in: wanted }, isActive: true }, select: { code: true } });
  const missing = wanted.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) throw new ServiceError(`Divisi tidak ditemukan atau nonaktif: ${missing.join(", ")}`, "division");
}

/** Kode dari nama: "Business Development" → BUSINESS_DEVELOPMENT. */
export function divisionCodeFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

/**
 * Tambah / ubah divisi. Divisi baru: tipe reimburse yang boleh dipakai divisi acuannya ikut dibuka
 * untuk divisi baru, dan alur approval otomatis mengikuti divisi acuan sampai Admin membuat alur sendiri.
 */
export async function saveDivision(db: PrismaClient, actorId: string, code: string | null, input: DivisionInput) {
  return db.$transaction(async (tx) => {
    const sameName = await tx.division.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, code: code ? { not: code } : undefined } });
    if (sameName) throw new ServiceError("Nama divisi sudah dipakai", "name");
    if (input.followsCode) {
      if (input.followsCode === code) throw new ServiceError("Divisi tidak bisa mengacu ke dirinya sendiri", "followsCode");
      await assertDivisions(tx, [input.followsCode]);
    }

    if (code) {
      const before = await tx.division.findUnique({ where: { code } });
      if (!before) throw new ServiceError("Divisi tidak ditemukan");
      if (!input.isActive && before.isActive) {
        const used = await tx.employee.count({ where: { division: code, status: "ACTIVE" } });
        if (used) throw new ServiceError(`Masih ada ${used} karyawan aktif di divisi ini — pindahkan dulu sebelum menonaktifkan`);
      }
      const after = await tx.division.update({ where: { code }, data: { name: input.name, followsCode: input.followsCode, isActive: input.isActive } });
      await logAudit(tx, { actorId, action: "UPDATE", entity: "Division", entityId: code, before, after });
      return after;
    }

    const newCode = divisionCodeFromName(input.name);
    if (!newCode) throw new ServiceError("Nama divisi tidak valid", "name");
    if (await tx.division.findUnique({ where: { code: newCode } })) throw new ServiceError(`Kode divisi ${newCode} sudah dipakai`, "name");
    const last = await tx.division.aggregate({ _max: { sortOrder: true } });
    const created = await tx.division.create({
      data: { code: newCode, name: input.name, followsCode: input.followsCode, isActive: input.isActive, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    if (input.followsCode) {
      const types = await tx.reimburseType.findMany({ where: { divisions: { has: input.followsCode } } });
      for (const type of types) await tx.reimburseType.update({ where: { id: type.id }, data: { divisions: [...type.divisions, newCode] } });
    }
    await logAudit(tx, { actorId, action: "CREATE", entity: "Division", entityId: newCode, after: created });
    return created;
  });
}
