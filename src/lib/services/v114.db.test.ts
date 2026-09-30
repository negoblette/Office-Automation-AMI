// Perubahan spesifikasi v1.14 (keputusan user 2026-09-29): nominal disetujui klaim kesehatan,
// soft delete (pulihkan libur / customer), flow tanpa approval, cuti Direktur di kalender.
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { approveRequest, buildApproval } from "@/lib/services/approval";
import { saveFlow } from "@/lib/services/approval-flow";
import { setHealthPlafond, submitHealthClaim } from "@/lib/services/health";
import { getHealthSummary } from "@/lib/services/health-queries";
import { addHolidays, deleteHoliday } from "@/lib/services/leave";
import { listDirectorLeaves, listHolidays } from "@/lib/services/leave-queries";
import { deleteCustomer, saveCustomer } from "@/lib/services/project";
import { healthClaimSchema, healthPlafondSchema } from "@/lib/validators/health";
import { approvalFlowSchema } from "@/lib/validators/setting";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
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

describe("klaim kesehatan: nominal diajukan & disetujui", () => {
  async function claimFor(key: string, amount: number) {
    await setHealthPlafond(testDb, u.ika, healthPlafondSchema.parse({ employeeId: actors[key].employeeId, year: 2026, annualAmount: 5_000_000 }));
    const categoryId = (await testDb.healthCategory.findFirstOrThrow()).id;
    const result = await submitHealthClaim(
      testDb,
      actors[key],
      healthClaimSchema.parse({ categoryId, claimDate: "2026-09-10", amount, invoiceFileKey: `${randomUUID()}.pdf`, invoiceFileName: "inv.pdf", note: "" }),
    );
    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "HEALTH", entityId: result.claimId } } });
    return { claimId: result.claimId, requestId: request.id };
  }

  it("approver menyetujui lebih kecil → nominal disetujui, pembayaran & plafon memakai nominal disetujui", async () => {
    const { claimId, requestId } = await claimFor("andi", 1_000_000);
    await approveRequest(testDb, { requestId, actorId: u.ika, approvedAmount: 750_000 });
    const claim = await testDb.healthClaim.findUniqueOrThrow({ where: { id: claimId }, include: { payouts: true } });
    expect([Number(claim.amount), Number(claim.approvedAmount)]).toEqual([1_000_000, 750_000]);
    expect(claim.payouts.map((p) => Number(p.amount))).toEqual([750_000]);
    const summary = await getHealthSummary(testDb, actors.andi.employeeId!);
    if (summary.year === 2026) expect(summary.approved).toBe(750_000);
  });

  it("tanpa isian → nominal disetujui = diajukan; lebih besar dari diajukan ditolak", async () => {
    const a = await claimFor("andi", 400_000);
    await expect(approveRequest(testDb, { requestId: a.requestId, actorId: u.ika, approvedAmount: 500_000 })).rejects.toThrow("tidak melebihi nominal diajukan");
    await approveRequest(testDb, { requestId: a.requestId, actorId: u.ika });
    expect(Number((await testDb.healthClaim.findUniqueOrThrow({ where: { id: a.claimId } })).approvedAmount)).toBe(400_000);
  });
});

describe("soft delete: data dipulihkan, bukan dibuat ganda", () => {
  it("hari libur yang dihapus bisa ditambahkan lagi di tanggal yang sama", async () => {
    await addHolidays(testDb, u.yosep, [{ date: "2026-12-24", name: "Cuti Bersama", isNational: false }]);
    const [holiday] = await listHolidays(testDb, "2026-12-24", "2026-12-24");
    await deleteHoliday(testDb, u.yosep, holiday.id);
    expect(await listHolidays(testDb, "2026-12-24", "2026-12-24")).toEqual([]);
    expect(await testDb.holiday.count()).toBe(1);
    await addHolidays(testDb, u.yosep, [{ date: "2026-12-24", name: "Cuti Bersama Natal", isNational: false }]);
    expect((await listHolidays(testDb, "2026-12-24", "2026-12-24")).map((h) => h.name)).toEqual(["Cuti Bersama Natal"]);
    expect(await testDb.holiday.count()).toBe(1);
  });

  it("customer yang dihapus dipulihkan saat ditambahkan lagi dengan nama sama", async () => {
    const customer = await saveCustomer(testDb, u.yosep, null, "PT Uji");
    await deleteCustomer(testDb, u.yosep, customer.id);
    const again = await saveCustomer(testDb, u.yosep, null, "PT Uji");
    expect(again.id).toBe(customer.id);
    expect(again.deletedAt).toBeNull();
  });
});

describe("approval flow tanpa level", () => {
  it("validasi: 'Tanpa approval' mengosongkan level; flow biasa wajib ≥ 1 level", () => {
    expect(approvalFlowSchema.parse({ module: "LEAVE", division: "SALES", noApproval: true, steps: [{ approverIds: ["x"] }] }).steps).toEqual([]);
    expect(() => approvalFlowSchema.parse({ module: "LEAVE", division: "SALES", noApproval: false, steps: [] })).toThrow("Minimal satu level");
  });

  it("flow cuti Sales dijadikan tanpa approval → pengajuan langsung APPROVED", async () => {
    await saveFlow(testDb, u.yosep, null, { module: "LEAVE", division: "SALES", steps: [] });
    const entityId = await createApprovalEntity("LEAVE", u.sinta);
    const result = await testDb.$transaction((tx) => buildApproval(tx, { module: "LEAVE", entityId, entityNumber: "LV/1", requesterId: u.sinta }));
    expect(result.status).toBe("APPROVED");
  });

  it("Fallback tidak boleh tanpa level", async () => {
    const fallback = await testDb.approvalFlow.findFirstOrThrow({ where: { scope: "FALLBACK" } });
    await expect(saveFlow(testDb, u.yosep, fallback.id, { steps: [] })).rejects.toThrow("minimal satu level");
  });
});

describe("kalender: Direktur cuti (BR-CUT-11)", () => {
  it("cuti Direktur yang tercatat tampil; cuti staf tidak", async () => {
    const rudy = await testDb.user.findUniqueOrThrow({ where: { id: u.rudy } });
    const andi = await testDb.user.findUniqueOrThrow({ where: { id: u.andi } });
    const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
    await testDb.leaveRequest.createMany({
      data: [
        { number: "LV/2026/10/0001", employeeId: rudy.employeeId!, startDate: d("2026-10-05"), endDate: d("2026-10-06"), workingDays: 2, reason: "x", status: "APPROVED" },
        { number: "LV/2026/10/0002", employeeId: andi.employeeId!, startDate: d("2026-10-05"), endDate: d("2026-10-05"), workingDays: 1, reason: "x", status: "APPROVED" },
      ],
    });
    expect((await listDirectorLeaves(testDb, "2026-01-01", "2026-12-31")).map((l) => l.employeeName)).toEqual(["Rudy"]);
  });
});
