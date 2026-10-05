import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest } from "@/lib/services/approval";
import { correctRequest, getCorrectionTargets, listCorrections } from "@/lib/services/approval-correction";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
import { saveCustomer } from "@/lib/services/project";
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

async function submitAndi() {
  const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
  const customerId = (await saveCustomer(testDb, u.ika, null, "PT Maju Selaras")).id;
  const row = (amount: number, activity: string, paymentMethod = "CASH") => ({
    date: "2026-09-12", customerId, projectId: "", activity, participants: "Andi – Engineer", location: "Jakarta",
    typeId, hasReceipt: false, paymentMethod, amount, receiptFileKey: "", receiptFileName: "",
  });
  const draft = await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row(200_000, "Tol"), row(300_000, "Bensin", "CC")] }));
  await submitReimbursement(testDb, actors.andi, draft.reimbursementId);
  const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "REIMBURSE", entityId: draft.reimbursementId } } });
  return { reimbursementId: draft.reimbursementId, requestId: request.id };
}

describe("koreksi approver (Fase 14)", () => {
  it("approver step aktif mengoreksi nominal & aktivitas; total dihitung ulang; tercatat sebelum → sesudah", async () => {
    const { reimbursementId, requestId } = await submitAndi();
    const targets = await getCorrectionTargets(testDb, requestId, u.yosep);
    expect(targets.map((t) => [t.text, t.amount])).toEqual([
      ["Tol", 200_000],
      ["Bensin", 300_000],
    ]);

    await correctRequest(testDb, u.yosep, requestId, [
      { targetId: targets[0].targetId, amount: 150_000, text: "Tol Cikampek" },
      { targetId: targets[1].targetId, amount: 300_000, text: "Bensin" }, // tidak berubah
    ]);
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } });
    expect([Number(r.totalCash), Number(r.totalCc), Number(r.total)]).toEqual([150_000, 300_000, 450_000]);

    const corrections = (await listCorrections(testDb, [requestId])).get(requestId)!;
    expect(corrections.map((c) => [c.field, c.before, c.after, c.editedBy, c.level])).toEqual([
      ["AMOUNT", "Rp 200.000", "Rp 150.000", "Yosep", 1],
      ["TEXT", "Tol", "Tol Cikampek", "Yosep", 1],
    ]);
    expect(await testDb.auditLog.count({ where: { entity: "ApprovalRequest", entityId: requestId, action: "UPDATE" } })).toBe(1);
  });

  it("hanya approver step aktif; pengajuan yang sudah final tidak bisa dikoreksi; tanpa perubahan ditolak", async () => {
    const { requestId } = await submitAndi();
    // Rudy approver L2 → belum gilirannya.
    await expect(getCorrectionTargets(testDb, requestId, u.rudy)).rejects.toThrow("tidak berhak");
    await expect(getCorrectionTargets(testDb, requestId, u.andi)).rejects.toThrow("tidak berhak");
    const [first] = await getCorrectionTargets(testDb, requestId, u.yosep);
    await expect(correctRequest(testDb, u.yosep, requestId, [{ targetId: first.targetId, amount: first.amount, text: first.text }])).rejects.toThrow("Tidak ada perubahan");
    await expect(correctRequest(testDb, u.yosep, requestId, [{ targetId: first.targetId, amount: 0 }])).rejects.toThrow("lebih dari 0");

    await approveRequest(testDb, { requestId, actorId: u.yosep });
    // Sekarang giliran Rudy (L2) yang boleh mengoreksi.
    await expect(correctRequest(testDb, u.rudy, requestId, [{ targetId: first.targetId, amount: 100_000 }])).resolves.toBe(1);
    await approveRequest(testDb, { requestId, actorId: u.rudy });
    await expect(getCorrectionTargets(testDb, requestId, u.rudy)).rejects.toThrow("sudah diproses");
  });
});
