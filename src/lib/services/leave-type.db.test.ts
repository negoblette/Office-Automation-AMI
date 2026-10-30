import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fromIsoDate } from "@/lib/format";
import type { Actor } from "@/lib/services/access";
import { approveRequest, revokeApproval } from "@/lib/services/approval";
import { listCorrections } from "@/lib/services/approval-correction";
import { submitLeaveRequest } from "@/lib/services/leave";
import { ensureLeaveBalance } from "@/lib/services/leave-balance";
import { leaveRequestSchema } from "@/lib/validators/leave";
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

const leave = (type: "ANNUAL" | "MATERNITY" | "BEREAVEMENT", startDate: string, endDate: string) =>
  leaveRequestSchema.parse({ type, startDate, endDate, reason: "Keperluan keluarga" });
const balanceOf = (key: string, ref: string) => testDb.$transaction((tx) => ensureLeaveBalance(tx, actors[key].employeeId!, ref));
const approvalOf = (leaveRequestId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "LEAVE", entityId: leaveRequestId } } });

describe("jenis cuti & potong saldo (2026-10-30)", () => {
  it("tanpa jenis = cuti tahunan yang memotong saldo (pengajuan lama & form lama)", async () => {
    const result = await submitLeaveRequest(testDb, actors.andi, leaveRequestSchema.parse({ startDate: "2026-10-05", endDate: "2026-10-05", reason: "Urusan" }));
    expect(await testDb.leaveRequest.findUniqueOrThrow({ where: { id: result.leaveRequestId } })).toMatchObject({ type: "ANNUAL", deductBalance: true });
  });

  it("melahirkan: tanpa syarat 1 tahun, melebihi saldo & lintas tahun boleh; tidak memotong saldo saat disetujui", async () => {
    await testDb.employmentPeriod.updateMany({ where: { employeeId: actors.sinta.employeeId! }, data: { startDate: fromIsoDate("2026-02-10") } });
    // 2 Nov 2026 – 29 Jan 2027: jauh melebihi saldo (belum punya jatah) dan melewati 31 Des.
    const result = await submitLeaveRequest(testDb, actors.sinta, leave("MATERNITY", "2026-11-02", "2027-01-29"));
    const saved = await testDb.leaveRequest.findUniqueOrThrow({ where: { id: result.leaveRequestId } });
    expect(saved).toMatchObject({ type: "MATERNITY", deductBalance: false, status: "PENDING" });

    await approveRequest(testDb, { requestId: (await approvalOf(result.leaveRequestId)).id, actorId: u.rudy });
    expect((await balanceOf("sinta", "2026-11-02")).used).toBe(0);
  });

  it("cuti yang tidak memotong saldo tidak mengurangi sisa saldo selama menunggu", async () => {
    await submitLeaveRequest(testDb, actors.andi, leave("BEREAVEMENT", "2026-10-05", "2026-10-16")); // 10 hari kerja
    // Jatah 12 hari tetap utuh untuk cuti tahunan (kalau cuti kematian ikut dihitung, sisa tinggal 2 hari).
    await expect(submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-11-02", "2026-11-17"))).resolves.toMatchObject({ status: "PENDING" });
  });

  it("approver mencentang potong saldo pada cuti kematian → saldo terpotong, tercatat sebagai koreksi; batal approval mengembalikan saldo", async () => {
    const result = await submitLeaveRequest(testDb, actors.andi, leave("BEREAVEMENT", "2026-10-05", "2026-10-06"));
    const approval = await approvalOf(result.leaveRequestId);
    await approveRequest(testDb, { requestId: approval.id, actorId: u.rudy, deductBalance: true });

    expect(await testDb.leaveRequest.findUniqueOrThrow({ where: { id: result.leaveRequestId } })).toMatchObject({ deductBalance: true, status: "APPROVED" });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(2);
    const corrections = (await listCorrections(testDb, [approval.id])).get(approval.id) ?? [];
    expect(corrections).toMatchObject([{ label: "Cuti · Potong saldo cuti", before: "Tidak", after: "Ya" }]);

    await revokeApproval(testDb, { requestId: approval.id, actorId: u.rudy, reason: "Salah centang" });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(0);
  });

  it("approver menghapus centang pada cuti tahunan → saldo tidak terpotong; centang tidak diubah → tanpa koreksi", async () => {
    const unchecked = await submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-10-05", "2026-10-06"));
    await approveRequest(testDb, { requestId: (await approvalOf(unchecked.leaveRequestId)).id, actorId: u.rudy, deductBalance: false });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(0);

    const kept = await submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-10-12", "2026-10-12"));
    const approval = await approvalOf(kept.leaveRequestId);
    await approveRequest(testDb, { requestId: approval.id, actorId: u.rudy, deductBalance: true });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(1);
    expect((await listCorrections(testDb, [approval.id])).get(approval.id)).toBeUndefined();
  });
});
