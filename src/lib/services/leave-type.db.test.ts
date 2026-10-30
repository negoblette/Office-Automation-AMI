import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Gender } from "@/generated/prisma/enums";
import { fromIsoDate } from "@/lib/format";
import type { Actor } from "@/lib/services/access";
import { approveRequest, revokeApproval } from "@/lib/services/approval";
import { listCorrections } from "@/lib/services/approval-correction";
import { submitLeaveRequest } from "@/lib/services/leave";
import { ensureLeaveBalance } from "@/lib/services/leave-balance";
import { defaultDeductDays, leaveRequestSchema } from "@/lib/validators/leave";
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
const setGender = (key: string, gender: Gender) => testDb.employee.update({ where: { id: actors[key].employeeId! }, data: { gender } });
const saved = (id: string) => testDb.leaveRequest.findUniqueOrThrow({ where: { id } });

describe("aturan hari dipotong (2026-10-30)", () => {
  it.each([
    ["ANNUAL", 5, null, 5],
    ["BEREAVEMENT", 3, null, 0],
    ["MATERNITY", 4, "MALE", 2], // laki-laki: 2 gratis, 2 potong
    ["MATERNITY", 2, "MALE", 0],
    ["MATERNITY", 90, "FEMALE", 0],
    ["MATERNITY", 95, "FEMALE", 5],
  ] as const)("%s %i hari kerja (%s) → %i dipotong", (type, days, gender, expected) => {
    expect(defaultDeductDays(type, days, gender)).toBe(expected);
  });
});

describe("jenis cuti & potong saldo (2026-10-30)", () => {
  it("tanpa jenis = cuti tahunan yang memotong semua hari (pengajuan lama & form lama)", async () => {
    const result = await submitLeaveRequest(testDb, actors.andi, leaveRequestSchema.parse({ startDate: "2026-10-05", endDate: "2026-10-06", reason: "Urusan" }));
    expect(await saved(result.leaveRequestId)).toMatchObject({ type: "ANNUAL", workingDays: 2, deductDays: 2 });
  });

  it("cuti melahirkan ditolak bila jenis kelamin belum diisi", async () => {
    await expect(submitLeaveRequest(testDb, actors.andi, leave("MATERNITY", "2026-10-05", "2026-10-06"))).rejects.toThrow("Isi jenis kelamin");
  });

  it("melahirkan laki-laki 4 hari kerja: 2 gratis, 2 memotong saldo saat disetujui", async () => {
    await setGender("andi", "MALE");
    const result = await submitLeaveRequest(testDb, actors.andi, leave("MATERNITY", "2026-10-05", "2026-10-08"));
    expect(await saved(result.leaveRequestId)).toMatchObject({ type: "MATERNITY", workingDays: 4, deductDays: 2 });
    await approveRequest(testDb, { requestId: (await approvalOf(result.leaveRequestId)).id, actorId: u.rudy });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(2);
  });

  it("melahirkan perempuan dalam jatah 90 hari kerja: tanpa syarat 1 tahun & saldo, boleh lintas tahun, tidak memotong saldo", async () => {
    await setGender("sinta", "FEMALE");
    await testDb.employmentPeriod.updateMany({ where: { employeeId: actors.sinta.employeeId! }, data: { startDate: fromIsoDate("2026-02-10") } });
    // 2 Nov 2026 – 29 Jan 2027: belum genap 1 tahun, melewati 31 Des, tapi < 90 hari kerja.
    const result = await submitLeaveRequest(testDb, actors.sinta, leave("MATERNITY", "2026-11-02", "2027-01-29"));
    expect(await saved(result.leaveRequestId)).toMatchObject({ deductDays: 0, status: "PENDING" });
    await approveRequest(testDb, { requestId: (await approvalOf(result.leaveRequestId)).id, actorId: u.rudy });
    expect((await balanceOf("sinta", "2026-11-02")).used).toBe(0);
  });

  it("bagian yang memotong saldo dicek terhadap sisa saldo", async () => {
    await setGender("andi", "MALE");
    await submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-10-05", "2026-10-16")); // 10 dari 12 hari
    // 5 hari kerja melahirkan → 3 dipotong, sisa saldo tinggal 2.
    await expect(submitLeaveRequest(testDb, actors.andi, leave("MATERNITY", "2026-11-02", "2026-11-06"))).rejects.toThrow(
      "Sisa saldo cuti 2 hari, sedangkan 3 hari kerja di luar jatah cuti melahirkan dipotong dari saldo (LV-08)",
    );
    await expect(submitLeaveRequest(testDb, actors.andi, leave("MATERNITY", "2026-11-02", "2026-11-05"))).resolves.toMatchObject({ status: "PENDING" });
  });

  it("cuti kematian tidak mengurangi sisa saldo selama menunggu", async () => {
    await submitLeaveRequest(testDb, actors.andi, leave("BEREAVEMENT", "2026-10-05", "2026-10-16")); // 10 hari kerja
    // Jatah 12 hari tetap utuh untuk cuti tahunan (kalau cuti kematian ikut dihitung, sisa tinggal 2 hari).
    await expect(submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-11-02", "2026-11-17"))).resolves.toMatchObject({ status: "PENDING" });
  });

  it("approver mengubah hari dipotong → saldo mengikuti, tercatat sebagai koreksi; batal approval mengembalikan saldo", async () => {
    const result = await submitLeaveRequest(testDb, actors.andi, leave("BEREAVEMENT", "2026-10-05", "2026-10-07"));
    const approval = await approvalOf(result.leaveRequestId);
    await expect(approveRequest(testDb, { requestId: approval.id, actorId: u.rudy, deductDays: 4 })).rejects.toThrow("harus 0–3");
    await approveRequest(testDb, { requestId: approval.id, actorId: u.rudy, deductDays: 2 });

    expect(await saved(result.leaveRequestId)).toMatchObject({ deductDays: 2, status: "APPROVED" });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(2);
    const corrections = (await listCorrections(testDb, [approval.id])).get(approval.id) ?? [];
    expect(corrections).toMatchObject([{ label: "Cuti · Hari dipotong dari saldo", before: "0 hari", after: "2 hari" }]);

    await revokeApproval(testDb, { requestId: approval.id, actorId: u.rudy, reason: "Salah isi" });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(0);
  });

  it("approver mengosongkan potongan cuti tahunan → saldo utuh; nilai tidak diubah → tanpa koreksi", async () => {
    const zeroed = await submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-10-05", "2026-10-06"));
    await approveRequest(testDb, { requestId: (await approvalOf(zeroed.leaveRequestId)).id, actorId: u.rudy, deductDays: 0 });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(0);

    const kept = await submitLeaveRequest(testDb, actors.andi, leave("ANNUAL", "2026-10-12", "2026-10-12"));
    const approval = await approvalOf(kept.leaveRequestId);
    await approveRequest(testDb, { requestId: approval.id, actorId: u.rudy, deductDays: 1 });
    expect((await balanceOf("andi", "2026-10-05")).used).toBe(1);
    expect((await listCorrections(testDb, [approval.id])).get(approval.id)).toBeUndefined();
  });
});
