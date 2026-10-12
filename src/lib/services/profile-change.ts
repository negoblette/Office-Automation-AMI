// Permintaan perubahan data karyawan (2026-10-12, keputusan user): perubahan data diri, keluarga,
// dokumen, dan hapus sertifikat terverifikasi oleh karyawan SENDIRI tidak langsung tersimpan — dibuat
// permintaan → disetujui Ci Ika (modul PROFILE_CHANGE; milik Ci Ika → Fallback) → baru diterapkan
// (`applyApprovedProfileChange`). Admin yang mengubah data karyawan LAIN tetap langsung.
import type { Prisma, PrismaClient, ProfileChangeKind } from "@/generated/prisma/client";
import { formatDate } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL, FAMILY_RELATION_LABEL, GENDER_LABEL, MARITAL_STATUS_LABEL } from "@/lib/labels";
import type { EmployeeSelfInput } from "@/lib/validators/employee";
import type { FamilyMemberInput } from "@/lib/validators/family";
import type { Actor } from "./access";
import { type ApprovalNotification, buildApproval, rejectionsOf } from "./approval";
import { logAudit } from "./audit";
import type { NewDocument } from "./document";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";
import { runProfileChange } from "./profile-change-apply";

export const PROFILE_CHANGE_KIND_LABEL: Record<ProfileChangeKind, string> = {
  SELF_DATA: "Ubah data diri",
  FAMILY_ADD: "Tambah anggota keluarga",
  FAMILY_UPDATE: "Ubah anggota keluarga",
  FAMILY_DELETE: "Hapus anggota keluarga",
  DOCUMENT_ADD: "Upload dokumen",
  DOCUMENT_DELETE: "Hapus dokumen",
  CERTIFICATE_DELETE: "Hapus sertifikat",
};

export type ProfileChangeInput = {
  kind: ProfileChangeKind;
  employeeId: string;
  targetId?: string | null;
  payload: unknown;
};

/** Perubahan data milik sendiri → wajib lewat persetujuan (siapa pun role-nya). */
export function needsProfileApproval(actor: Actor, employeeId: string | null | undefined) {
  return Boolean(employeeId) && actor.employeeId === employeeId;
}

class DryRunDone extends Error {}

/** Coba terapkan di transaksi yang lalu dibatalkan — validasi persis sama dengan saat disetujui. */
async function validateByDryRun(db: PrismaClient, actor: Actor, input: ProfileChangeInput) {
  try {
    await db.$transaction(async (tx) => {
      await runProfileChange(tx, actor, { kind: input.kind, employeeId: input.employeeId, targetId: input.targetId ?? null, payload: input.payload });
      throw new DryRunDone();
    });
  } catch (error) {
    if (!(error instanceof DryRunDone)) throw error;
  }
}

const SELF_LABELS: Record<keyof EmployeeSelfInput, string> = {
  nik: "NIK",
  kkNo: "Nomor KK",
  birthPlace: "Tempat lahir",
  birthDate: "Tanggal lahir",
  gender: "Jenis kelamin",
  maritalStatus: "Status pernikahan",
  address: "Alamat",
  phone: "Nomor HP",
  npwp: "NPWP",
  bpjsTkNo: "BPJS Ketenagakerjaan",
  bpjsKesNo: "BPJS Kesehatan",
  emergencyName: "Nama kontak darurat",
  emergencyRelation: "Hubungan kontak darurat",
  emergencyPhone: "No HP kontak darurat",
};

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return formatDate(value);
  if (key === "birthDate" && typeof value === "string") return formatDate(`${value}T00:00:00Z`);
  if (key === "gender") return GENDER_LABEL[value as keyof typeof GENDER_LABEL] ?? String(value);
  if (key === "maritalStatus") return MARITAL_STATUS_LABEL[value as keyof typeof MARITAL_STATUS_LABEL] ?? String(value);
  return String(value);
}

const iso = (value: Date | string | null | undefined) => (value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null));

/** Ringkasan sebelum → sesudah untuk approver & pemohon. */
async function summarize(db: PrismaClient, input: ProfileChangeInput): Promise<{ lines: string[]; fileKey?: string; fileName?: string }> {
  switch (input.kind) {
    case "SELF_DATA": {
      const payload = input.payload as EmployeeSelfInput;
      const current = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
      const lines = (Object.keys(SELF_LABELS) as (keyof EmployeeSelfInput)[])
        .filter((key) => {
          const before = key === "birthDate" ? iso(current.birthDate) : (current[key] ?? null);
          return (before ?? null) !== (payload[key] ?? null);
        })
        .map((key) => `${SELF_LABELS[key]}: ${show(key, key === "birthDate" ? iso(current.birthDate) : current[key])} → ${show(key, payload[key])}`);
      if (!lines.length) throw new ServiceError("Tidak ada perubahan data diri");
      return { lines };
    }
    case "FAMILY_ADD": {
      const p = input.payload as FamilyMemberInput;
      return { lines: [`${FAMILY_RELATION_LABEL[p.relation]}: ${p.fullName}${p.nik ? ` (NIK ${p.nik})` : ""}`] };
    }
    case "FAMILY_UPDATE": {
      const p = input.payload as FamilyMemberInput;
      const before = await db.familyMember.findUniqueOrThrow({ where: { id: input.targetId! } });
      const lines = [
        before.fullName !== p.fullName && `Nama: ${before.fullName} → ${p.fullName}`,
        (before.nik ?? null) !== (p.nik ?? null) && `NIK: ${before.nik ?? "—"} → ${p.nik ?? "—"}`,
        iso(before.birthDate) !== (p.birthDate ?? null) && `Tanggal lahir: ${show("birthDate", iso(before.birthDate))} → ${show("birthDate", p.birthDate)}`,
      ].filter((l): l is string => Boolean(l));
      if (!lines.length) throw new ServiceError("Tidak ada perubahan data keluarga");
      return { lines: [`${FAMILY_RELATION_LABEL[before.relation]} ${before.fullName}`, ...lines] };
    }
    case "FAMILY_DELETE": {
      const member = await db.familyMember.findUniqueOrThrow({ where: { id: input.targetId! } });
      return { lines: [`${FAMILY_RELATION_LABEL[member.relation]}: ${member.fullName} (beserta dokumennya)`] };
    }
    case "DOCUMENT_ADD": {
      const p = input.payload as Omit<NewDocument, "employeeId">;
      const member = p.familyMemberId ? await db.familyMember.findUnique({ where: { id: p.familyMemberId } }) : null;
      return { lines: [`${DOCUMENT_TYPE_LABEL[p.docType]}${member ? ` — ${member.fullName}` : ""}: ${p.fileName}`], fileKey: p.fileKey, fileName: p.fileName };
    }
    case "DOCUMENT_DELETE": {
      const document = await db.document.findUniqueOrThrow({ where: { id: input.targetId! } });
      return { lines: [`${DOCUMENT_TYPE_LABEL[document.docType]}: ${document.fileName}`] };
    }
    case "CERTIFICATE_DELETE": {
      const certificate = await db.certificate.findUniqueOrThrow({ where: { id: input.targetId! } });
      return { lines: [`Sertifikat ${certificate.name}`] };
    }
  }
}

export type RequestProfileChangeResult = { changeId: string; number: string; status: "PENDING" | "APPROVED"; notifications: ApprovalNotification[] };

/** Buat permintaan perubahan (data milik sendiri) + approval. Email di-enqueue pemanggil setelah commit. */
export async function requestProfileChange(db: PrismaClient, actor: Actor, input: ProfileChangeInput): Promise<RequestProfileChangeResult> {
  if (!needsProfileApproval(actor, input.employeeId)) throw new ServiceError("Permintaan perubahan hanya untuk data milik sendiri");
  await validateByDryRun(db, actor, input);
  const { lines, fileKey, fileName } = await summarize(db, input);

  return db.$transaction(async (tx) => {
    // Satu perubahan menunggu per data yang sama (data diri / anggota keluarga / dokumen / sertifikat tertentu).
    if (input.kind === "SELF_DATA" || input.targetId) {
      const duplicate = await tx.profileChangeRequest.findFirst({
        where: { employeeId: input.employeeId, kind: input.kind, targetId: input.targetId ?? null, status: "PENDING" },
      });
      if (duplicate) throw new ServiceError(`Masih ada perubahan serupa (${duplicate.number}) yang menunggu persetujuan`);
    }

    const number = await nextDocumentNumber(tx, "PRF");
    const change = await tx.profileChangeRequest.create({
      data: {
        number,
        employeeId: input.employeeId,
        kind: input.kind,
        targetId: input.targetId ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        summary: lines,
        fileKey: fileKey ?? null,
        fileName: fileName ?? null,
        requestedById: actor.id,
      },
    });
    const approval = await buildApproval(tx, { module: "PROFILE_CHANGE", entityId: change.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "ProfileChangeRequest", entityId: change.id, after: change });
    return { changeId: change.id, number, status: approval.status, notifications: approval.notifications };
  });
}

export type ProfileChangeView = {
  id: string;
  number: string;
  kind: ProfileChangeKind;
  kindLabel: string;
  summary: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "DRAFT";
  createdAt: string;
  rejection: { reason: string; by: string } | null;
};

/** Permintaan perubahan milik karyawan: menunggu & ditolak (30 hari terakhir), plus 5 terakhir yang disetujui. */
export async function listProfileChanges(db: PrismaClient, employeeId: string): Promise<ProfileChangeView[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [open, approved] = await Promise.all([
    db.profileChangeRequest.findMany({
      where: { employeeId, OR: [{ status: "PENDING" }, { status: "REJECTED", createdAt: { gte: since } }] },
      orderBy: { createdAt: "desc" },
    }),
    db.profileChangeRequest.findMany({ where: { employeeId, status: "APPROVED", appliedAt: { gte: since } }, orderBy: { appliedAt: "desc" }, take: 5 }),
  ]);
  const rows = [...open, ...approved];
  const rejections = await rejectionsOf(db, "PROFILE_CHANGE", rows.filter((r) => r.status === "REJECTED").map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    kind: r.kind,
    kindLabel: PROFILE_CHANGE_KIND_LABEL[r.kind],
    summary: r.summary,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    rejection: rejections.get(r.id) ?? null,
  }));
}

/** Ringkasan untuk antrian approval. */
export function profileChangeSummary(change: { kind: ProfileChangeKind; summary: string[]; employee: { fullName: string } }) {
  return `${PROFILE_CHANGE_KIND_LABEL[change.kind]} · ${change.employee.fullName} — ${change.summary.join("; ")}`;
}

