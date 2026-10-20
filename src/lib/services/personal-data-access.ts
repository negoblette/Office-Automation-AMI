// Alat engineer untuk membuka data pribadi asli (hardening Tahap 4, docs/08-INVENTARIS-DATA.md). Dijalankan di server
// (tempat kunci berada) lewat `npm run data:lihat` / `npm run data:cari-nik`, wajib alasan & nama operator, dan setiap
// pemakaian SELALU tercatat di audit log (VIEW_PERSONAL_DATA) sebelum data ditampilkan.
import type { PrismaClient } from "@/generated/prisma/client";
import { nikIndex } from "@/lib/crypto/field-encryption";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { compareFamilyMembers, openEmployee, openFamilyMember } from "./personal-data";

export type PersonalDataAccess = {
  /** Alasan membuka data (minimal 10 karakter), mis. nomor tiket / permintaan HRD. */
  reason: string;
  /** Nama orang yang menjalankan alat — user di container/server bersifat umum. */
  operator: string;
  /** Nama mesin yang menjalankan alat. */
  host?: string;
};

function assertAccess(access: PersonalDataAccess) {
  if (access.reason.trim().length < 10) throw new ServiceError("Alasan wajib diisi, minimal 10 karakter (--alasan)");
  if (access.operator.trim().length < 3) throw new ServiceError("Nama yang menjalankan alat wajib diisi (--oleh)");
}

function auditDetail(tool: string, access: PersonalDataAccess, extra: Record<string, unknown> = {}) {
  return { alat: tool, alasan: access.reason.trim(), oleh: access.operator.trim(), host: access.host ?? null, ...extra };
}

/** `npm run data:lihat`: data pribadi asli satu karyawan (dicari lewat email atau id) beserta keluarganya. */
export async function viewPersonalData(db: PrismaClient, query: string, access: PersonalDataAccess) {
  assertAccess(access);
  const key = query.trim();
  const row = await db.employee.findFirst({
    where: { OR: [{ id: key }, { email: key.toLowerCase() }] },
    include: { family: { where: { deletedAt: null } } },
  });
  if (!row) throw new ServiceError("Karyawan tidak ditemukan");
  await logAudit(db, { actorId: null, action: "VIEW_PERSONAL_DATA", entity: "Employee", entityId: row.id, after: auditDetail("data:lihat", access) });

  const { family, ...employee } = openEmployee(row);
  return {
    id: employee.id,
    fullName: employee.fullName,
    email: employee.email,
    status: employee.status,
    personal: {
      nik: employee.nik,
      kkNo: employee.kkNo,
      birthPlace: employee.birthPlace,
      birthDate: employee.birthDate,
      address: employee.address,
      phone: employee.phone,
      npwp: employee.npwp,
      bpjsTkNo: employee.bpjsTkNo,
      bpjsKesNo: employee.bpjsKesNo,
      emergencyName: employee.emergencyName,
      emergencyRelation: employee.emergencyRelation,
      emergencyPhone: employee.emergencyPhone,
    },
    family: family
      .map((member) => openFamilyMember(member))
      .sort(compareFamilyMembers)
      .map((member) => ({ relation: member.relation, fullName: member.fullName, nik: member.nik, birthDate: member.birthDate })),
  };
}

/** `npm run data:cari-nik`: cari karyawan lewat NIK (sidik jari) tanpa menampilkan data pribadinya. */
export async function findEmployeeByNik(db: PrismaClient, nikInput: string, access: PersonalDataAccess) {
  assertAccess(access);
  const nik = nikInput.replace(/\s/g, "");
  if (!/^\d{16}$/.test(nik)) throw new ServiceError("NIK harus 16 digit angka");
  const employee = await db.employee.findUnique({
    where: { nikHash: nikIndex(nik) },
    select: { id: true, fullName: true, email: true, status: true },
  });
  // NIK yang dicari tidak ikut dicatat (audit log tidak boleh memuat NIK terbuka).
  await logAudit(db, {
    actorId: null,
    action: "VIEW_PERSONAL_DATA",
    entity: "Employee",
    entityId: employee?.id ?? "-",
    after: auditDetail("data:cari-nik", access, { ditemukan: Boolean(employee) }),
  });
  return employee;
}
