// Kolom data pribadi terenkripsi (hardening Tahap 4, keputusan user 2026-10-20; docs/08-INVENTARIS-DATA.md):
// dikunci saat ditulis ke database, dibuka saat dibaca. Logika bisnis tetap memakai nilai terbuka — hanya baris
// yang menulis/membaca database yang lewat modul ini.
import { FamilyRelation } from "@/generated/prisma/enums";
import { decryptText, encryptText, isEncryptedValue, nikIndex } from "@/lib/crypto/field-encryption";

export const EMPLOYEE_ENCRYPTED_FIELDS = [
  "nik",
  "kkNo",
  "birthDate",
  "phone",
  "npwp",
  "bpjsTkNo",
  "bpjsKesNo",
  "emergencyName",
  "emergencyRelation",
  "emergencyPhone",
] as const;
export const FAMILY_ENCRYPTED_FIELDS = ["nik", "birthDate"] as const;
export const CANDIDATE_ENCRYPTED_FIELDS = ["nik", "phone"] as const;

type EmployeeEncryptedField = (typeof EMPLOYEE_ENCRYPTED_FIELDS)[number];
type FamilyEncryptedField = (typeof FAMILY_ENCRYPTED_FIELDS)[number];
type CandidateEncryptedField = (typeof CANDIDATE_ENCRYPTED_FIELDS)[number];
type TextFields<K extends string> = { [P in K]?: string | null };

/** Salinan `row` dengan kolom `fields` (yang ada) dipetakan lewat `map`; kolom lain tidak disentuh. */
function mapFields<T extends object>(row: T, fields: readonly string[], map: (value: string | null | undefined) => string | null | undefined): T {
  const result = { ...row } as Record<string, unknown>;
  for (const field of fields) {
    if (field in result) result[field] = map(result[field] as string | null | undefined);
  }
  return result as T;
}

/** Data karyawan sebelum ditulis: kolom pribadi dikunci, `nikHash` (sidik jari NIK) ikut diisi bila `nik` ditulis. */
export function sealEmployeeData<T extends TextFields<EmployeeEncryptedField>>(data: T): T & { nikHash?: string | null } {
  const sealed = mapFields(data, EMPLOYEE_ENCRYPTED_FIELDS, encryptText);
  return "nik" in data ? { ...sealed, nikHash: data.nik ? nikIndex(data.nik) : null } : sealed;
}

/** Baris karyawan dari database: kolom pribadi dibuka; `nikHash` tidak ikut keluar (tidak dikirim ke halaman). */
export function openEmployee<T extends TextFields<EmployeeEncryptedField> & { nikHash?: string | null }>(row: T): Omit<T, "nikHash"> {
  const opened: Partial<T> = mapFields(row, EMPLOYEE_ENCRYPTED_FIELDS, decryptText);
  delete opened.nikHash;
  return opened as Omit<T, "nikHash">;
}

export function sealFamilyData<T extends TextFields<FamilyEncryptedField>>(data: T): T {
  return mapFields(data, FAMILY_ENCRYPTED_FIELDS, encryptText);
}

export function openFamilyMember<T extends TextFields<FamilyEncryptedField>>(row: T): T {
  return mapFields(row, FAMILY_ENCRYPTED_FIELDS, decryptText);
}

export function sealCandidateData<T extends TextFields<CandidateEncryptedField>>(data: T): T {
  return mapFields(data, CANDIDATE_ENCRYPTED_FIELDS, encryptText);
}

export function openCandidate<T extends TextFields<CandidateEncryptedField>>(row: T): T {
  return mapFields(row, CANDIDATE_ENCRYPTED_FIELDS, decryptText);
}

/** Isi Json (payload permintaan perubahan data) disimpan sebagai satu string terenkripsi. */
export function sealJson(value: unknown): string {
  return encryptText(JSON.stringify(value ?? null));
}

/** Kebalikan `sealJson`; payload lama yang masih berupa objek Json dikembalikan apa adanya. */
export function openJson(value: unknown): unknown {
  return typeof value === "string" && isEncryptedValue(value) ? JSON.parse(decryptText(value)) : value;
}

/** Ringkasan sebelum → sesudah (memuat nilai data pribadi) disimpan per baris terenkripsi. */
export function sealLines(lines: string[]): string[] {
  return lines.map((line) => encryptText(line));
}

export function openLines(lines: string[]): string[] {
  return lines.map((line) => decryptText(line));
}

const RELATION_ORDER: readonly FamilyRelation[] = Object.values(FamilyRelation);

/**
 * Urutan anggota keluarga — sama dengan ORDER BY database sebelum tanggal lahir dienkripsi:
 * hubungan menurun (urutan enum SPOUSE, CHILD → anak dulu), tanggal lahir naik dengan yang kosong di akhir, lalu waktu input.
 */
export function compareFamilyMembers(
  a: { relation: FamilyRelation; birthDate: string | null; createdAt: Date },
  b: { relation: FamilyRelation; birthDate: string | null; createdAt: Date },
): number {
  const relation = RELATION_ORDER.indexOf(b.relation) - RELATION_ORDER.indexOf(a.relation);
  if (relation !== 0) return relation;
  if (a.birthDate !== b.birthDate) {
    if (!a.birthDate) return 1;
    if (!b.birthDate) return -1;
    return a.birthDate < b.birthDate ? -1 : 1;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

const AUDIT_ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  Employee: EMPLOYEE_ENCRYPTED_FIELDS,
  FamilyMember: FAMILY_ENCRYPTED_FIELDS,
  Candidate: CANDIDATE_ENCRYPTED_FIELDS,
};

function sealIfPlain(value: unknown): unknown {
  if (value instanceof Date) return encryptText(value.toISOString().slice(0, 10));
  return typeof value === "string" && !isEncryptedValue(value) ? encryptText(value) : value;
}

/**
 * Jaring pengaman audit log: nilai data pribadi yang masih terbuka di before/after dikunci sebelum disimpan.
 * Baris yang diambil dari database sudah terenkripsi, jadi biasanya tidak ada yang berubah.
 */
export function protectAuditValue(entity: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row: Record<string, unknown> = { ...value };
  if (entity === "ProfileChangeRequest") {
    if ("payload" in row && !(typeof row.payload === "string" && isEncryptedValue(row.payload))) row.payload = sealJson(row.payload);
    if (Array.isArray(row.summary)) row.summary = row.summary.map(sealIfPlain);
    return row;
  }
  const fields = AUDIT_ENCRYPTED_FIELDS[entity];
  if (!fields) return value;
  for (const field of fields) {
    if (field in row) row[field] = sealIfPlain(row[field]);
  }
  return row;
}
