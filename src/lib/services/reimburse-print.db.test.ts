import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { saveCustomer, saveProject } from "@/lib/services/project";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { getReimbursePrintData } from "@/lib/services/reimbursement-queries";
import { projectLabel } from "@/lib/labels";
import { projectSchema } from "@/lib/validators/project";
import { dailySubtotals, reimbursementSchema } from "@/lib/validators/reimbursement";
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

async function setup() {
  const mandiri = await saveCustomer(testDb, u.ika, null, "PT Bank Mandiri");
  const bca = await saveCustomer(testDb, u.ika, null, "PT BCA");
  const project = await saveProject(testDb, u.ika, null, projectSchema.parse({ customerId: mandiri.id, code: "prj-0012", name: "Core Network", type: "RUNNING", isActive: true }));
  const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
  const row = (over: Record<string, unknown> = {}) => ({
    date: "2026-09-12", customerId: bca.id, projectId: "", activity: "Onsite", participants: "Andi – Engineer", location: "Jakarta",
    typeId, hasReceipt: false, paymentMethod: "CASH", amount: 100_000, ...over,
  });
  return { mandiri, bca, project, row };
}

describe("project ID & company → project (Fase 14)", () => {
  it("ID project disimpan huruf besar, unik, tampil 'ID - Nama'", async () => {
    const { mandiri, project } = await setup();
    expect(projectLabel(project)).toBe("PRJ-0012 - Core Network");
    await expect(
      saveProject(testDb, u.ika, null, projectSchema.parse({ customerId: mandiri.id, code: "PRJ-0012", name: "Lain", type: "RUNNING", isActive: true })),
    ).rejects.toThrow("sudah dipakai");
  });

  it("project wajib milik company yang dipilih; tidak boleh project + New Acquisition sekaligus", async () => {
    const { mandiri, project, row } = await setup();
    const save = (over: Record<string, unknown>) => saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row(over)] }));
    await expect(save({ projectId: project.id })).rejects.toThrow("project bukan milik PT BCA");
    await expect(save({ customerId: mandiri.id, projectId: project.id, newAcquisition: true })).rejects.toThrow("bukan keduanya");
    await expect(save({ customerId: mandiri.id, projectId: project.id })).resolves.toBeTruthy();
  });
});

describe("subtotal per hari & rekap cetak per bulan (Fase 14)", () => {
  it("dailySubtotals mengelompokkan per tanggal", () => {
    expect(
      dailySubtotals([
        { date: "2026-09-13", amount: 50_000 },
        { date: "2026-09-12", amount: 100_000 },
        { date: "2026-09-12", amount: 25_000 },
        { date: "", amount: 1 },
      ]),
    ).toEqual([
      { date: "2026-09-12", amount: 125_000 },
      { date: "2026-09-13", amount: 50_000 },
    ]);
  });

  it("rekap bulan: hanya pengajuan yang sudah diajukan, transaksi di bulan itu, milik karyawan itu", async () => {
    const { mandiri, project, row } = await setup();
    const submitted = await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({
      note: "",
      items: [row({ customerId: mandiri.id, projectId: project.id }), row({ newAcquisition: true, amount: 40_000 }), row({ date: "2026-10-01", amount: 70_000 })],
    }));
    await submitReimbursement(testDb, actors.andi, submitted.reimbursementId);
    await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row({ amount: 999_000 })] })); // draft
    const data = await getReimbursePrintData(testDb, actors.andi.employeeId!, "2026-09");
    expect(data?.rows.map((r) => [r.date, r.amount, r.projectName, r.status])).toEqual([
      ["2026-09-12", 100_000, "PRJ-0012 - Core Network", "PENDING"],
      ["2026-09-12", 40_000, "New Acquisition (prospek)", "PENDING"],
    ]);
    expect((await getReimbursePrintData(testDb, actors.sinta.employeeId!, "2026-09"))?.rows).toEqual([]);
  });
});
