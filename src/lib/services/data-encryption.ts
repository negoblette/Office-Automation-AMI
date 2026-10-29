// `npm run data:encrypt` (hardening Tahap 4, docs/08-INVENTARIS-DATA.md): mengenkripsi data pribadi & file upload yang
// masih terbuka, mengenkripsi ulang yang memakai kunci lama (rotasi), dan menghitung ulang sidik jari NIK.
// Aman dijalankan berulang. Semua nilai terenkripsi ikut dibuka sekali sebagai pengecekan: kunci yang salah membuat
// proses gagal (di produksi: deploy berhenti sebelum aplikasi jalan).
// Sengaja mencakup baris yang sudah dihapus (soft delete) — datanya tetap tersimpan, jadi tetap harus terenkripsi.
import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { decryptText, encryptedKeyId, encryptText, nikIndex } from "@/lib/crypto/field-encryption";
import { decryptFile, encryptedFileKeyId, encryptFile } from "@/lib/crypto/file-encryption";
import { activeKeyId, nikIndexKey } from "@/lib/crypto/keys";
import { isValidFileKey } from "@/lib/storage/local";
import { CANDIDATE_ENCRYPTED_FIELDS, EMPLOYEE_ENCRYPTED_FIELDS, FAMILY_ENCRYPTED_FIELDS } from "./personal-data";

export type TableReport = { table: string; rows: number; changedRows: number; changedValues: number };
export type EncryptionReport = { dryRun: boolean; keyId: string; tables: TableReport[]; files: { total: number; changed: number } };

/** Nilai teks yang perlu dikunci (masih terbuka atau berkunci lama). Nilai berkunci aktif dibuka sebagai pengecekan. */
function needsSealing(value: string | null, keyId: string): value is string {
  if (!value) return false;
  if (encryptedKeyId(value) !== keyId) return true;
  decryptText(value);
  return false;
}

/** Kolom terenkripsi `fields` pada `row` yang perlu dikunci (ulang) dengan kunci aktif. */
function sealedChanges(row: object, fields: readonly string[], keyId: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of fields) {
    const value = (row as Record<string, string | null>)[field];
    if (needsSealing(value, keyId)) data[field] = encryptText(decryptText(value));
  }
  return data;
}

function report(table: string, rows: number, changes: Record<string, unknown>[]): TableReport {
  return { table, rows, changedRows: changes.length, changedValues: changes.reduce((sum, change) => sum + Object.keys(change).length, 0) };
}

async function encryptEmployees(db: PrismaClient, keyId: string, dryRun: boolean): Promise<TableReport> {
  const rows = await db.employee.findMany({ orderBy: { id: "asc" } });
  const changes: Record<string, unknown>[] = [];
  for (const row of rows) {
    const data: Record<string, unknown> = sealedChanges(row, EMPLOYEE_ENCRYPTED_FIELDS, keyId);
    const nik = decryptText(row.nik);
    const nikHash = nik ? nikIndex(nik) : null;
    if (nikHash !== row.nikHash) data.nikHash = nikHash;
    if (!Object.keys(data).length) continue;
    changes.push(data);
    // updatedAt dipertahankan: isi data tidak berubah, hanya cara penyimpanannya.
    if (!dryRun) await db.employee.update({ where: { id: row.id }, data: { ...data, updatedAt: row.updatedAt } as Prisma.EmployeeUncheckedUpdateInput });
  }
  return report("Employee", rows.length, changes);
}

async function encryptFamilyMembers(db: PrismaClient, keyId: string, dryRun: boolean): Promise<TableReport> {
  const rows = await db.familyMember.findMany({ select: { id: true, nik: true, birthDate: true }, orderBy: { id: "asc" } });
  const changes: Record<string, unknown>[] = [];
  for (const row of rows) {
    const data = sealedChanges(row, FAMILY_ENCRYPTED_FIELDS, keyId);
    if (!Object.keys(data).length) continue;
    changes.push(data);
    if (!dryRun) await db.familyMember.update({ where: { id: row.id }, data });
  }
  return report("FamilyMember", rows.length, changes);
}

async function encryptCandidates(db: PrismaClient, keyId: string, dryRun: boolean): Promise<TableReport> {
  const rows = await db.candidate.findMany({ select: { id: true, nik: true, phone: true, updatedAt: true }, orderBy: { id: "asc" } });
  const changes: Record<string, unknown>[] = [];
  for (const row of rows) {
    const data = sealedChanges(row, CANDIDATE_ENCRYPTED_FIELDS, keyId);
    if (!Object.keys(data).length) continue;
    changes.push(data);
    if (!dryRun) await db.candidate.update({ where: { id: row.id }, data: { ...data, updatedAt: row.updatedAt } });
  }
  return report("Candidate", rows.length, changes);
}

/**
 * File upload di `dir`: file terbuka / berkunci lama dikunci dengan kunci aktif. Ditulis ke file sementara lalu
 * di-rename, jadi aman bila proses terputus. Satu file berkunci aktif dibuka sebagai pengecekan kunci.
 */
export async function encryptStoredFiles(dir: string, keyId: string, dryRun: boolean): Promise<{ total: number; changed: number }> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { total: 0, changed: 0 };
    throw error;
  }
  let total = 0;
  let changed = 0;
  let checked = false;
  for (const name of names) {
    const file = path.join(dir, name);
    // Sisa file sementara dari proses yang terputus.
    if (name.startsWith(".") && name.endsWith(".tmp")) {
      if (!dryRun) await rm(file, { force: true });
      continue;
    }
    if (!isValidFileKey(name)) continue;
    total++;
    const bytes = await readFile(file);
    if (encryptedFileKeyId(bytes) === keyId) {
      if (!checked) decryptFile(bytes, name);
      checked = true;
      continue;
    }
    changed++;
    if (dryRun) continue;
    const temp = path.join(dir, `.${name}.${randomUUID()}.tmp`);
    await writeFile(temp, encryptFile(decryptFile(bytes, name), name), { flag: "wx" });
    await rename(temp, file);
  }
  return { total, changed };
}

/** Jalankan semuanya. `uploadDir` null → file tidak disentuh. */
export async function encryptPersonalData(
  db: PrismaClient,
  options: { dryRun?: boolean; uploadDir?: string | null } = {},
): Promise<EncryptionReport> {
  const dryRun = options.dryRun ?? false;
  // Kedua kunci wajib ada sebelum apa pun diubah.
  const keyId = activeKeyId();
  nikIndexKey();
  const tables = [
    await encryptEmployees(db, keyId, dryRun),
    await encryptFamilyMembers(db, keyId, dryRun),
    await encryptCandidates(db, keyId, dryRun),
  ];
  const files = options.uploadDir ? await encryptStoredFiles(options.uploadDir, keyId, dryRun) : { total: 0, changed: 0 };
  return { dryRun, keyId, tables, files };
}
