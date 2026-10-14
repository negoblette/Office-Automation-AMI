import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, rejectionsOf, rejectRequest } from "@/lib/services/approval";
import { submitAppeal } from "@/lib/services/attendance-appeal";
import { addCertificate, updateCertificate } from "@/lib/services/certificate";
import { setHealthPlafond, submitHealthClaim } from "@/lib/services/health";
import { submitLeaveRequest } from "@/lib/services/leave";
import { saveCustomer } from "@/lib/services/project";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { certificateSchema } from "@/lib/validators/certificate";
import { healthClaimSchema, healthPlafondSchema } from "@/lib/validators/health";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
/** Surat keterangan sakit (wajib untuk appeal Sakit, 2026-10-14). */
const sickNote = () => ({ fileKey: `${randomUUID()}.pdf`, fileName: "surat-dokter.pdf" });
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

const requestOf = (module: "REIMBURSE" | "LEAVE" | "HEALTH" | "CERTIFICATE" | "ATTENDANCE_APPEAL", entityId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module, entityId } }, include: { steps: { orderBy: { level: "asc" } } } });

async function reimburseInput(amount: number) {
  const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
  const customer = await testDb.customer.findFirst({ where: { name: "PT Maju Selaras" } });
  const customerId = customer?.id ?? (await saveCustomer(testDb, u.ika, null, "PT Maju Selaras")).id;
  return reimbursementSchema.parse({
    note: "",
    items: [{ date: "2026-09-12", customerId, projectId: "", activity: "Tol", participants: "", location: "Jakarta", typeId, hasReceipt: false, paymentMethod: "PERSONAL", amount }],
  });
}

describe("tolak & revisi (2026-10-12, OI-05)", () => {
  it("reimburse: approver menolak dengan alasan → pemohon revisi & ajukan ulang (nomor tetap, mulai lagi dari L1)", async () => {
    const draft = await saveReimbursementDraft(testDb, actors.andi, null, await reimburseInput(200_000));
    const { number } = await submitReimbursement(testDb, actors.andi, draft.reimbursementId);
    const request = await requestOf("REIMBURSE", draft.reimbursementId);

    await expect(rejectRequest(testDb, { requestId: request.id, actorId: u.rudy, reason: "Salah" })).rejects.toThrow("tidak berhak"); // belum giliran L2
    await expect(rejectRequest(testDb, { requestId: request.id, actorId: u.yosep, reason: "x" })).rejects.toThrow("minimal 3");
    const result = await rejectRequest(testDb, { requestId: request.id, actorId: u.yosep, reason: "Kwitansi tol tidak sesuai" });
    expect(result.notifications).toEqual([{ template: "approval-rejected", recipientIds: [u.andi], requestId: request.id }]);
    expect(await testDb.reimbursement.findUniqueOrThrow({ where: { id: draft.reimbursementId } })).toMatchObject({ status: "REJECTED" });
    expect((await rejectionsOf(testDb, "REIMBURSE", [draft.reimbursementId])).get(draft.reimbursementId)).toMatchObject({
      reason: "Kwitansi tol tidak sesuai",
      by: "Yosep",
      level: 1,
    });
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("sudah diproses");

    // Revisi: nominal diubah, diajukan ulang.
    await saveReimbursementDraft(testDb, actors.andi, draft.reimbursementId, await reimburseInput(150_000));
    const again = await submitReimbursement(testDb, actors.andi, draft.reimbursementId);
    expect(again.number).toBe(number);
    expect(again.notifications[0]).toMatchObject({ template: "approval-requested", recipientIds: [u.yosep] });
    const renewed = await requestOf("REIMBURSE", draft.reimbursementId);
    expect(renewed.steps.map((s) => s.status)).toEqual(["PENDING", "WAITING"]);
    expect(Number((await testDb.reimbursement.findUniqueOrThrow({ where: { id: draft.reimbursementId } })).total)).toBe(150_000);
    expect(await testDb.auditLog.count({ where: { action: "REJECT", entityId: request.id } })).toBe(1);
  });

  it("cuti: ditolak → revisi tanggal & ajukan ulang; yang tidak ditolak tidak bisa direvisi", async () => {
    const leave = await submitLeaveRequest(testDb, actors.andi, leaveRequestSchema.parse({ startDate: "2026-10-05", endDate: "2026-10-06", reason: "Keluarga" }));
    await expect(
      submitLeaveRequest(testDb, actors.andi, leaveRequestSchema.parse({ startDate: "2026-10-07", endDate: "2026-10-07", reason: "Keluarga" }), leave.leaveRequestId),
    ).rejects.toThrow("Hanya pengajuan yang ditolak");
    await rejectRequest(testDb, { requestId: (await requestOf("LEAVE", leave.leaveRequestId)).id, actorId: u.rudy, reason: "Bentrok jadwal proyek" });

    const revised = await submitLeaveRequest(
      testDb,
      actors.andi,
      leaveRequestSchema.parse({ startDate: "2026-10-12", endDate: "2026-10-14", reason: "Keluarga" }),
      leave.leaveRequestId,
    );
    expect(revised).toMatchObject({ number: leave.number, workingDays: 3, status: "PENDING" });
    expect(await testDb.leaveRequest.count({ where: { employeeId: actors.andi.employeeId! } })).toBe(1);
  });

  it("klaim kesehatan, sertifikat, appeal: ditolak → revisi → menunggu approval lagi", async () => {
    await setHealthPlafond(testDb, u.ika, healthPlafondSchema.parse({ employeeId: actors.andi.employeeId, year: 2026, annualAmount: 5_000_000 }));
    const categoryId = (await testDb.healthCategory.findFirstOrThrow()).id;
    const claim = await submitHealthClaim(testDb, actors.andi, healthClaimSchema.parse({ categoryId, claimDate: "2026-09-10", amount: 300_000, note: "" }));
    await rejectRequest(testDb, { requestId: (await requestOf("HEALTH", claim.claimId)).id, actorId: u.ika, reason: "Nominal tidak sesuai invoice" });
    const revisedClaim = await submitHealthClaim(testDb, actors.andi, healthClaimSchema.parse({ categoryId, claimDate: "2026-09-10", amount: 250_000, note: "" }), claim.claimId);
    expect(revisedClaim).toMatchObject({ number: claim.number, status: "PENDING" });

    const certInput = (name: string) =>
      certificateSchema.parse({ type: "PROFESSIONAL", name, level: "1", startDate: "2024-01-01", endDate: "2027-01-01", fileKey: `${randomUUID()}.pdf` });
    const cert = await addCertificate(testDb, actors.andi, actors.andi.employeeId!, certInput("CCNA"));
    const certRequest = await requestOf("CERTIFICATE", cert.id);
    await rejectRequest(testDb, { requestId: certRequest.id, actorId: certRequest.steps[0].approverIds[0], reason: "File buram" });
    const updated = await updateCertificate(testDb, actors.andi, cert.id, certInput("Cisco CCNA"));
    expect(updated.notifications[0]).toMatchObject({ template: "approval-requested" });
    expect((await testDb.certificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe("PENDING");

    const appeal = await submitAppeal(testDb, actors.andi, { date: "2026-10-12", reason: "SICK", note: "Demam", ...sickNote() }, "2026-10-14");
    await rejectRequest(testDb, { requestId: (await requestOf("ATTENDANCE_APPEAL", appeal.appealId)).id, actorId: u.ika, reason: "Lampirkan keterangan dokter" });
    const again = await submitAppeal(testDb, actors.andi, { date: "2026-10-12", reason: "SICK", note: "Demam, surat dokter menyusul", ...sickNote() }, "2026-10-15");
    expect(again).toMatchObject({ number: appeal.number, status: "PENDING" });
  });
});
