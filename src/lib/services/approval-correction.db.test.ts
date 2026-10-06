import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, canRevoke, revokeApproval } from "@/lib/services/approval";
import { type CorrectionTarget, correctRequest, getCorrectionTargets, listCorrections } from "@/lib/services/approval-correction";
import { submitLeaveRequest } from "@/lib/services/leave";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { NEW_ACQUISITION, reimbursementSchema } from "@/lib/validators/reimbursement";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { projectSchema } from "@/lib/validators/project";
import { saveCustomer, saveProject } from "@/lib/services/project";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const actors: Record<string, Actor> = {};
let otherCustomerId: string;

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
  otherCustomerId = (await saveCustomer(testDb, u.ika, null, "PT Lain")).id;
  const row = (amount: number, activity: string, paymentMethod = "CASH") => ({
    date: "2026-09-12", customerId, projectId: "", activity, participants: "Andi – Engineer", location: "Jakarta",
    typeId, hasReceipt: false, paymentMethod, amount, receiptFileKey: "", receiptFileName: "",
  });
  const draft = await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row(200_000, "Tol"), row(300_000, "Bensin", "CC")] }));
  await submitReimbursement(testDb, actors.andi, draft.reimbursementId);
  const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "REIMBURSE", entityId: draft.reimbursementId } } });
  return { reimbursementId: draft.reimbursementId, requestId: request.id };
}


const field = (t: CorrectionTarget, key: string) => t.fields.find((f) => f.key === key)!.value;

describe("koreksi approver (Fase 14, diperluas 2026-10-06)", () => {
  it("approver step aktif mengoreksi banyak field; total dihitung ulang; tercatat sebelum → sesudah", async () => {
    const { reimbursementId, requestId } = await submitAndi();
    const project = await saveProject(testDb, u.ika, null, projectSchema.parse({ customerId: otherCustomerId, code: "PRJ-0100", name: "Core", type: "RUNNING", isActive: true }));
    const targets = await getCorrectionTargets(testDb, requestId, u.yosep);
    expect(targets.map((t) => [field(t, "activity"), field(t, "amount"), field(t, "paymentMethod")])).toEqual([
      ["Tol", 200_000, "CASH"],
      ["Bensin", 300_000, "CC"],
    ]);
    const mealsId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "MEALS" } })).id;

    await correctRequest(testDb, u.yosep, requestId, [
      { targetId: targets[0].targetId, values: { amount: 150_000, activity: "Tol Cikampek", date: "2026-09-11", typeId: mealsId, paymentMethod: "CC" } },
      // Ganti company + pilih project milik company baru; tidak berubah lainnya.
      { targetId: targets[1].targetId, values: { customerId: otherCustomerId, project: project.id, hasReceipt: true } },
    ]);
    const r = await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId }, include: { items: { orderBy: { id: "asc" } } } });
    expect([Number(r.totalCash), Number(r.totalCc), Number(r.total)]).toEqual([0, 450_000, 450_000]);
    expect(r.items[0]).toMatchObject({ activity: "Tol Cikampek", typeId: mealsId, paymentMethod: "CC" });
    expect(r.items[0].date.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(r.items[1]).toMatchObject({ customerId: otherCustomerId, projectId: project.id, hasReceipt: true, newAcquisition: false });

    const corrections = (await listCorrections(testDb, [requestId])).get(requestId)!;
    expect(corrections.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Baris 1 · Tanggal", "12 Sep 2026", "11 Sep 2026"],
      ["Baris 1 · Tipe", "Transport", "Meals"],
      ["Baris 1 · Payment", "Cash", "Kartu Kredit"],
      ["Baris 1 · Nominal", "Rp 200.000", "Rp 150.000"],
      ["Baris 1 · Aktivitas", "Tol", "Tol Cikampek"],
      ["Baris 2 · Company", "PT Maju Selaras", "PT Lain"],
      ["Baris 2 · Project", "Tanpa project", "PRJ-0100 - Core"],
      ["Baris 2 · Ada kwitansi fisik", "Tidak", "Ya"],
    ]);
    expect(new Set(corrections.map((c) => c.level))).toEqual(new Set([1]));
    expect(await testDb.auditLog.count({ where: { entity: "ApprovalRequest", entityId: requestId, action: "UPDATE" } })).toBe(1);
  });

  it("validasi: project harus milik company; New Acquisition; nominal > 0; tanggal tidak di masa depan; tanpa perubahan ditolak", async () => {
    const { requestId } = await submitAndi();
    const project = await saveProject(testDb, u.ika, null, projectSchema.parse({ customerId: otherCustomerId, code: "PRJ-0100", name: "Core", type: "RUNNING", isActive: true }));
    const [first] = await getCorrectionTargets(testDb, requestId, u.yosep);
    const correct = (values: Record<string, string | number | boolean | null>) => correctRequest(testDb, u.yosep, requestId, [{ targetId: first.targetId, values }]);
    await expect(correct({ project: project.id })).rejects.toThrow("tidak sesuai company");
    await expect(correct({ amount: 0 })).rejects.toThrow("lebih dari 0");
    await expect(correct({ date: "2999-01-01" })).rejects.toThrow("masa depan");
    await expect(correct({ typeId: "tidak-ada" })).rejects.toThrow("pilihan tidak valid");
    await expect(correct({ activity: field(first, "activity") })).rejects.toThrow("Tidak ada perubahan");
    await expect(correct({ project: NEW_ACQUISITION })).resolves.toBe(1);
    expect((await testDb.reimbursementItem.findUniqueOrThrow({ where: { id: first.targetId } })).newAcquisition).toBe(true);
  });

  it("hanya approver step aktif; pengajuan yang sudah final tidak bisa dikoreksi", async () => {
    const { requestId } = await submitAndi();
    // Rudy approver L2 → belum gilirannya.
    await expect(getCorrectionTargets(testDb, requestId, u.rudy)).rejects.toThrow("tidak berhak");
    await expect(getCorrectionTargets(testDb, requestId, u.andi)).rejects.toThrow("tidak berhak");
    const [first] = await getCorrectionTargets(testDb, requestId, u.yosep);

    await approveRequest(testDb, { requestId, actorId: u.yosep });
    // Sekarang giliran Rudy (L2) yang boleh mengoreksi.
    await expect(correctRequest(testDb, u.rudy, requestId, [{ targetId: first.targetId, values: { amount: 100_000 } }])).resolves.toBe(1);
    await approveRequest(testDb, { requestId, actorId: u.rudy });
    await expect(getCorrectionTargets(testDb, requestId, u.rudy)).rejects.toThrow("sudah diproses");
  });
});

describe("batalkan approval / ubah keputusan (2026-10-06)", () => {
  const stepsOf = async (requestId: string) =>
    (await testDb.approvalRequestStep.findMany({ where: { requestId }, orderBy: { level: "asc" } })).map((s) => [s.level, s.status, s.actedById]);

  it("approver membatalkan persetujuannya sebelum level berikutnya memutuskan → kembali menunggu dia", async () => {
    const { requestId } = await submitAndi();
    await approveRequest(testDb, { requestId, actorId: u.yosep });
    const before = await testDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { steps: true } });
    expect(canRevoke({ id: u.yosep, role: "APPROVER" }, before)).toBe(true);
    expect(canRevoke({ id: u.darwin, role: "APPROVER" }, before)).toBe(false); // bukan yang menyetujui, bukan Admin
    expect(canRevoke({ id: u.andi, role: "STAFF" }, before)).toBe(false);

    await expect(revokeApproval(testDb, { requestId, actorId: u.darwin, reason: "Salah klik" })).rejects.toThrow("Hanya approver yang menyetujui atau Admin");
    await expect(revokeApproval(testDb, { requestId, actorId: u.yosep, reason: "x" })).rejects.toThrow("minimal 3");
    const result = await revokeApproval(testDb, { requestId, actorId: u.yosep, reason: "Salah klik" });
    expect(result.notifications).toEqual([]); // satu-satunya approver L1 = yang membatalkan
    expect(await stepsOf(requestId)).toEqual([
      [1, "PENDING", null],
      [2, "WAITING", null],
    ]);
    expect(await testDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "PENDING", currentLevel: 1 });
    const [log] = (await listCorrections(testDb, [requestId])).get(requestId)!;
    expect(log).toMatchObject({ field: "REVOKE", label: "Persetujuan level 1", before: "Disetujui Yosep", after: "Dibatalkan: Salah klik", editedBy: "Yosep" });
    expect(await testDb.auditLog.count({ where: { entityId: requestId, action: "REVOKE" } })).toBe(1);

    // Bisa dikoreksi & disetujui ulang.
    await expect(approveRequest(testDb, { requestId, actorId: u.yosep })).resolves.toMatchObject({ status: "PENDING" });
  });

  it("Admin membatalkan persetujuan final reimburse → status kembali PENDING di level terakhir; email ke approver level itu", async () => {
    const { reimbursementId, requestId } = await submitAndi();
    await approveRequest(testDb, { requestId, actorId: u.yosep });
    await approveRequest(testDb, { requestId, actorId: u.rudy });
    // Persetujuan L1 tidak bisa dibatalkan lagi karena L2 sudah memutuskan → yang dibatalkan L2.
    const result = await revokeApproval(testDb, { requestId, actorId: u.ika, reason: "Nominal perlu dicek ulang" });
    expect(result.notifications).toEqual([{ template: "approval-requested", recipientIds: [u.rudy], requestId }]);
    expect(await stepsOf(requestId)).toEqual([
      [1, "APPROVED", u.yosep],
      [2, "PENDING", null],
    ]);
    expect(await testDb.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })).toMatchObject({ status: "PENDING", approvedAt: null });
    expect(await testDb.approvalRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "PENDING", currentLevel: 2, completedAt: null });
  });

  it("cuti final dibatalkan → saldo dikembalikan; pemohon & persetujuan otomatis tidak bisa dibatalkan", async () => {
    const leaveResult = await submitLeaveRequest(testDb, actors.andi, leaveRequestSchema.parse({ startDate: "2026-10-05", endDate: "2026-10-06", reason: "Keperluan keluarga" }));
    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "LEAVE", entityId: leaveResult.leaveRequestId } } });
    await approveRequest(testDb, { requestId: request.id, actorId: u.rudy });
    const used = async () => (await testDb.leaveBalance.findFirstOrThrow({ where: { employeeId: actors.andi.employeeId! }, orderBy: { periodStart: "desc" } })).used;
    expect(await used()).toBe(2);

    await expect(revokeApproval(testDb, { requestId: request.id, actorId: u.andi, reason: "Batal" })).rejects.toThrow("tidak berhak");
    await revokeApproval(testDb, { requestId: request.id, actorId: u.rudy, reason: "Tanggal bentrok proyek" });
    expect(await used()).toBe(0);
    expect((await testDb.leaveRequest.findUniqueOrThrow({ where: { id: leaveResult.leaveRequestId } })).status).toBe("PENDING");

    // Cuti Direktur (tanpa approval) → disetujui otomatis, tidak ada yang bisa dibatalkan.
    const auto = await submitLeaveRequest(testDb, actors.rudy, leaveRequestSchema.parse({ startDate: "2026-10-07", endDate: "2026-10-07", reason: "Keperluan keluarga" }));
    const autoRequest = await testDb.approvalRequest.findUnique({ where: { module_entityId: { module: "LEAVE", entityId: auto.leaveRequestId } } });
    if (autoRequest) await expect(revokeApproval(testDb, { requestId: autoRequest.id, actorId: u.ika, reason: "Coba" })).rejects.toThrow("Tidak ada persetujuan");
  });
});
