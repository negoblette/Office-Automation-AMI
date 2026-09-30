import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/features";
import { buildApproval } from "@/lib/services/approval";
import { getAdminDashboard, getStaffDashboard, weekRange } from "@/lib/services/dashboard-queries";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { resetAndSeed } from "@/test/seed";

const TODAY = "2026-09-24"; // Kamis
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
let u: Record<string, string>;
let andiEmployeeId: string;

beforeEach(async () => {
  u = await resetAndSeed();
  andiEmployeeId = (await testDb.user.findUniqueOrThrow({ where: { id: u.andi } })).employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("weekRange", () => {
  it("Senin–Minggu pekan berjalan", () => {
    expect(weekRange("2026-09-24")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(weekRange("2026-09-21")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(weekRange("2026-09-27")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
  });
});

describe("getAdminDashboard", () => {
  it("antrian sendiri, unit dipinjam, item berakhir ≤ 30 hari, cuti & libur pekan ini", async () => {
    const entityId = await createApprovalEntity("REIMBURSE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/09/0001", requesterId: u.andi }));
    const asset = await testDb.asset.create({ data: { deviceName: "Router", serialNo: "SN1", category: "DEMO_UNIT", warrantyEnd: d("2026-10-01") } });
    await testDb.assetAssignment.create({ data: { assetId: asset.id, employeeId: andiEmployeeId, assignedAt: d("2026-09-01") } });
    await testDb.certificate.create({ data: { employeeId: andiEmployeeId, type: "PROFESSIONAL", name: "CCNA", startDate: d("2024-01-01"), endDate: d("2026-09-30") } });
    await testDb.leaveRequest.create({
      data: { number: "LV/2026/09/0001", employeeId: andiEmployeeId, startDate: d("2026-09-18"), endDate: d("2026-09-22"), workingDays: 3, reason: "x", status: "APPROVED" },
    });
    await testDb.holiday.create({ data: { date: d("2026-09-25"), name: "Libur Uji" } });

    const yosep = await getAdminDashboard(testDb, u.yosep, TODAY);
    expect(yosep.queue.map((r) => r.entityNumber)).toEqual(["RMB/2026/09/0001"]);
    expect(yosep.pendingAll).toBe(1);
    if (FEATURES.inventory) {
      expect(yosep.assets).toEqual({ total: 1, assigned: 1 });
      expect(yosep.expiring.map((i) => [i.name, i.daysLeft])).toEqual([
        ["CCNA", 6],
        ["Router", 7],
      ]);
    } else {
      // Inventory ditunda: kartu unit & item unit tidak ikut.
      expect(yosep.assets).toBeNull();
      expect(yosep.expiring.map((i) => [i.name, i.daysLeft])).toEqual([["CCNA", 6]]);
    }
    expect(yosep.week.events.map((e) => (e.kind === "leave" ? e.employeeName : e.name))).toEqual(["Andi Pratama", "Libur Uji"]);

    // Darwin bukan approver L1 Engineer → antrian kosong.
    expect((await getAdminDashboard(testDb, u.darwin, TODAY)).queue).toEqual([]);
  });
});

describe("getStaffDashboard", () => {
  it("pengajuan milik sendiri + reminder sertifikat & dokumen", async () => {
    const entityId = await createApprovalEntity("REIMBURSE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/09/0001", requesterId: u.andi }));
    await testDb.certificate.create({ data: { employeeId: andiEmployeeId, type: "PROFESSIONAL", name: "CCNA", startDate: d("2024-01-01"), endDate: d("2020-01-01") } });

    const andi = await getStaffDashboard(testDb, { id: u.andi, employeeId: andiEmployeeId }, TODAY);
    expect(andi.requests.map((r) => r.entityNumber)).toEqual(["RMB/2026/09/0001"]);
    expect(andi.certificates.map((c) => c.status)).toEqual(["EXPIRED"]);
    expect(andi.documentMissing.length).toBeGreaterThan(0);
    expect(andi.balance?.employeeId).toBe(andiEmployeeId);

    const sinta = await getStaffDashboard(testDb, { id: u.sinta, employeeId: null }, TODAY);
    expect(sinta.requests).toEqual([]);
  });
});
