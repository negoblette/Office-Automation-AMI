import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, rejectRequest } from "@/lib/services/approval";
import { countPendingApprovals, listMyApprovalQueue } from "@/lib/services/approval-queries";
import { resetUserMfa } from "@/lib/services/mfa";
import { saveCustomer } from "@/lib/services/project";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { resetUserPassword, setUserActive, setUserRole } from "@/lib/services/user-admin";
import { canActOnStep } from "@/lib/roles";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let superId: string;

beforeEach(async () => {
  u = await resetAndSeed();
  for (const [key, id] of Object.entries(u)) {
    const user = await testDb.user.findUniqueOrThrow({ where: { id } });
    actors[key] = { id: user.id, role: user.role, employeeId: user.employeeId };
  }
  // Akun Admin sistem tanpa data karyawan, seperti admin.oa@arthamitra.co.id di produksi.
  superId = (await testDb.user.create({ data: { email: "admin.oa@test.local", passwordHash: "x", role: "ADMIN", isSuperAdmin: true, mfaSecret: "rahasia" } })).id;
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** Reimburse Andi (Engineer: L1 Yosep, L2 Rudy) yang sudah diajukan. */
async function submittedReimburse() {
  const customerId = (await saveCustomer(testDb, u.ika, null, "PT Maju Selaras")).id;
  const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
  const input = reimbursementSchema.parse({
    note: "",
    items: [{ date: "2026-10-20", customerId, projectId: "", activity: "Tol", participants: "", location: "Jakarta", typeId, hasReceipt: false, paymentMethod: "PERSONAL", amount: 100_000 }],
  });
  const { reimbursementId } = await saveReimbursementDraft(testDb, actors.andi, null, input);
  await submitReimbursement(testDb, actors.andi, reimbursementId);
  return testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "REIMBURSE", entityId: reimbursementId } } });
}

describe("super admin (2026-10-30)", () => {
  it("boleh memutuskan step mana pun, kecuali pengajuannya sendiri", () => {
    const step = { approverIds: ["yosep"] };
    expect(canActOnStep({ id: "yosep", isSuperAdmin: false }, step, "andi")).toBe(true);
    expect(canActOnStep({ id: "ika", isSuperAdmin: false }, step, "andi")).toBe(false);
    expect(canActOnStep({ id: "super", isSuperAdmin: true }, step, "andi")).toBe(true);
    expect(canActOnStep({ id: "super", isSuperAdmin: true }, step, "super")).toBe(false);
  });

  it("melihat semua antrian & menyetujui/menolak pengajuan walau tidak ada di approval flow", async () => {
    const request = await submittedReimburse();
    expect(await countPendingApprovals(testDb, superId)).toBe(1);
    const [row] = await listMyApprovalQueue(testDb, superId);
    expect(row).toMatchObject({ id: request.id, canApprove: true });
    // Admin biasa yang bukan approver step tetap ditolak.
    expect(await countPendingApprovals(testDb, u.ika)).toBe(0);
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.ika })).rejects.toThrow("Anda tidak berhak menyetujui pengajuan ini");

    await expect(approveRequest(testDb, { requestId: request.id, actorId: superId })).resolves.toMatchObject({ status: "PENDING" });
    const steps = await testDb.approvalRequestStep.findMany({ where: { requestId: request.id }, orderBy: { level: "asc" } });
    expect(steps.map((s) => [s.status, s.actedById])).toEqual([
      ["APPROVED", superId],
      ["PENDING", null],
    ]);
    await expect(rejectRequest(testDb, { requestId: request.id, actorId: superId, reason: "Tidak sesuai" })).resolves.toMatchObject({ status: "REJECTED" });
  });

  it("tidak bisa diubah, dinonaktifkan, atau di-reset Admin lain; dirinya sendiri tetap bisa ganti password", async () => {
    const blocked = "Akun super admin tidak bisa diubah oleh Admin lain";
    await expect(setUserRole(testDb, u.ika, superId, "STAFF")).rejects.toThrow(blocked);
    await expect(setUserActive(testDb, u.ika, superId, false)).rejects.toThrow(blocked);
    await expect(resetUserPassword(testDb, u.ika, superId, "password-sementara-panjang")).rejects.toThrow(blocked);
    await expect(resetUserMfa(testDb, u.ika, superId)).rejects.toThrow(blocked);
    await expect(resetUserPassword(testDb, superId, superId, "password-sementara-panjang")).resolves.toBeUndefined();
    expect(await testDb.user.findUniqueOrThrow({ where: { id: superId } })).toMatchObject({ role: "ADMIN", isActive: true, isSuperAdmin: true });
  });
});
