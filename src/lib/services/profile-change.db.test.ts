import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, rejectRequest } from "@/lib/services/approval";
import { addCertificate } from "@/lib/services/certificate";
import { canAccessFile, prismaFileAccessRepository } from "@/lib/services/file-access";
import { listProfileChanges, needsProfileApproval, rejectedSelfDataDraft, requestProfileChange } from "@/lib/services/profile-change";
import { parseChangeLines } from "@/lib/profile-change-lines";
import { certificateSchema } from "@/lib/validators/certificate";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { familyMemberSchema } from "@/lib/validators/family";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

const requestOf = (entityId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "PROFILE_CHANGE", entityId } } });
const self = (overrides: Record<string, unknown> = {}) =>
  employeeSelfSchema.parse({ maritalStatus: "MARRIED", nik: "3171012345678901", address: "Jl. Melati 1", ...overrides });

describe("perubahan data karyawan lewat Ci Ika (2026-10-12)", () => {
  it("data diri: tidak langsung tersimpan; ringkasan sebelum → sesudah; diterapkan setelah Ci Ika setuju", async () => {
    const result = await requestProfileChange(testDb, actors.andi, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self() });
    expect(result).toMatchObject({ status: "PENDING", number: expect.stringMatching(/^PRF\//) });
    expect(result.notifications[0].recipientIds).toEqual([u.ika]);
    expect((await testDb.employee.findUniqueOrThrow({ where: { id: actors.andi.employeeId! } })).address).toBeNull(); // belum berubah

    const [view] = await listProfileChanges(testDb, actors.andi.employeeId!);
    expect(view).toMatchObject({ kindLabel: "Ubah data diri", status: "PENDING" });
    expect(view.summary).toEqual(expect.arrayContaining(["NIK: — → 3171012345678901", "Status pernikahan: Belum menikah → Menikah", "Alamat: — → Jl. Melati 1"]));

    await expect(requestProfileChange(testDb, actors.andi, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self({ address: "Lain" }) })).rejects.toThrow(
      "menunggu persetujuan",
    );
    await approveRequest(testDb, { requestId: (await requestOf(result.changeId)).id, actorId: u.ika });
    expect(await testDb.employee.findUniqueOrThrow({ where: { id: actors.andi.employeeId! } })).toMatchObject({ address: "Jl. Melati 1", maritalStatus: "MARRIED" });
    expect(await testDb.profileChangeRequest.findUniqueOrThrow({ where: { id: result.changeId } })).toMatchObject({ status: "APPROVED", appliedAt: expect.any(Date) });
  });

  it("validasi sama seperti simpan langsung (NIK dipakai orang lain ditolak saat mengajukan); milik Ci Ika → Fallback", async () => {
    await testDb.employee.update({ where: { id: actors.sinta.employeeId! }, data: { nik: "3171012345678901" } });
    await expect(requestProfileChange(testDb, actors.andi, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self() })).rejects.toThrow("NIK");
    expect(await testDb.profileChangeRequest.count()).toBe(0);

    const ika = await requestProfileChange(testDb, actors.ika, { kind: "SELF_DATA", employeeId: actors.ika.employeeId!, payload: self({ nik: "3171012345678902" }) });
    expect([...ika.notifications[0].recipientIds].sort()).toEqual([u.rudy, u.leonard].sort());
    expect(needsProfileApproval(actors.ika, actors.andi.employeeId)).toBe(false); // Admin ubah data orang lain → langsung
    await expect(requestProfileChange(testDb, actors.ika, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self() })).rejects.toThrow("milik sendiri");
  });

  it("keluarga: ditolak → tidak diterapkan, alasan tampil; dokumen: file bisa dibuka Ci Ika lalu tersimpan setelah disetujui", async () => {
    await testDb.employee.update({ where: { id: actors.andi.employeeId! }, data: { maritalStatus: "MARRIED" } });
    const family = await requestProfileChange(testDb, actors.andi, {
      kind: "FAMILY_ADD",
      employeeId: actors.andi.employeeId!,
      payload: familyMemberSchema.parse({ relation: "SPOUSE", fullName: "Rina", nik: "", birthDate: "" }),
    });
    await rejectRequest(testDb, { requestId: (await requestOf(family.changeId)).id, actorId: u.ika, reason: "Lampirkan surat nikah" });
    expect(await testDb.familyMember.count({ where: { employeeId: actors.andi.employeeId! } })).toBe(0);
    expect((await listProfileChanges(testDb, actors.andi.employeeId!))[0]).toMatchObject({ status: "REJECTED", rejection: { reason: "Lampirkan surat nikah", by: "Ika" } });

    const fileKey = `${randomUUID()}.pdf`;
    const doc = await requestProfileChange(testDb, actors.andi, {
      kind: "DOCUMENT_ADD",
      employeeId: actors.andi.employeeId!,
      payload: { docType: "SURAT_NIKAH_CERAI", fileKey, fileName: "nikah.pdf", mimeType: "application/pdf", sizeBytes: 10, familyMemberId: null },
    });
    const owner = await prismaFileAccessRepository(testDb).findFileOwner(fileKey);
    expect(canAccessFile({ id: u.ika, role: "ADMIN", employeeId: actors.ika.employeeId }, owner!)).toBe(true);
    expect(canAccessFile({ id: u.sinta, role: "STAFF", employeeId: actors.sinta.employeeId }, owner!)).toBe(false);
    await approveRequest(testDb, { requestId: (await requestOf(doc.changeId)).id, actorId: u.ika });
    expect(await testDb.document.count({ where: { employeeId: actors.andi.employeeId!, fileKey } })).toBe(1);
  });

  it("hapus sertifikat terverifikasi milik sendiri lewat persetujuan", async () => {
    const certificate = await addCertificate(
      testDb,
      actors.andi,
      actors.andi.employeeId!,
      certificateSchema.parse({ type: "PROFESSIONAL", name: "CCNA", level: "1", startDate: "2024-01-01", noExpiry: true, fileKey: `${randomUUID()}.pdf` }),
    );
    const verify = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "CERTIFICATE", entityId: certificate.id } } });
    await approveRequest(testDb, { requestId: verify.id, actorId: u.ika });
    const change = await requestProfileChange(testDb, actors.andi, { kind: "CERTIFICATE_DELETE", employeeId: actors.andi.employeeId!, targetId: certificate.id, payload: {} });
    expect((await testDb.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).deletedAt).toBeNull();
    await approveRequest(testDb, { requestId: (await requestOf(change.changeId)).id, actorId: u.ika });
    expect((await testDb.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).deletedAt).not.toBeNull();
  });

  it("2026-10-13: data diri ditolak → form berisi usulan + alasan; ajukan ulang = nomor sama, mulai lagi dari L1", async () => {
    const first = await requestProfileChange(testDb, actors.andi, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self() });
    await rejectRequest(testDb, { requestId: (await requestOf(first.changeId)).id, actorId: u.ika, reason: "NIK tidak sesuai KTP" });

    const draft = await rejectedSelfDataDraft(testDb, actors.andi.employeeId!);
    expect(draft).toMatchObject({ number: first.number, payload: { nik: "3171012345678901", address: "Jl. Melati 1" }, rejection: { reason: "NIK tidak sesuai KTP" } });

    const again = await requestProfileChange(testDb, actors.andi, { kind: "SELF_DATA", employeeId: actors.andi.employeeId!, payload: self({ nik: "3171012345678909" }) });
    expect(again).toMatchObject({ changeId: first.changeId, number: first.number, status: "PENDING" });
    expect(again.notifications[0].recipientIds).toEqual([u.ika]);
    expect(await testDb.profileChangeRequest.count()).toBe(1);
    expect(await rejectedSelfDataDraft(testDb, actors.andi.employeeId!)).toBeNull();
  });
});

describe("pratinjau perubahan (2026-10-13)", () => {
  it("baris ringkasan → tabel Data | Sebelum | Sesudah", () => {
    expect(parseChangeLines(["Suami / Istri Rina", "NIK: — → 3171012345678901", "Alamat: Jl. A: blok 2 → Jl. B", "Suami / Istri: Rina"])).toEqual({
      context: ["Suami / Istri Rina"],
      rows: [
        { label: "NIK", before: "—", after: "3171012345678901" },
        { label: "Alamat", before: "Jl. A: blok 2", after: "Jl. B" },
        { label: "Suami / Istri", before: "—", after: "Rina" },
      ],
    });
  });
});
