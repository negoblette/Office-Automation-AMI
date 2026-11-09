import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/services/access";
import { saveCustomer } from "@/lib/services/project";
import { buildReimburseWorkbook, listReimburseExportRows } from "@/lib/services/reimburse-export";
import { saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { reimbursementSchema } from "@/lib/validators/reimbursement";
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

describe("ekspor reimburse ke Excel (2026-10-16; 2026-11-09: pengajuan yang dipilih)", () => {
  it("hanya pengajuan yang dipilih, tanpa draft; selain Admin hanya miliknya; workbook berisi detail + ringkasan", async () => {
    const bca = await saveCustomer(testDb, u.ika, null, "PT BCA");
    const typeId = (await testDb.reimburseType.findUniqueOrThrow({ where: { code: "TRANSPORT" } })).id;
    const row = (over: Record<string, unknown> = {}) => ({
      date: "2026-09-12", customerId: bca.id, projectId: "", newAcquisition: true, activity: "Onsite", participants: "", location: "Jakarta",
      typeId, hasReceipt: false, paymentMethod: "PERSONAL", amount: 100_000, ...over,
    });
    const submit = async (actor: Actor, items: Record<string, unknown>[]) => {
      const draft = await saveReimbursementDraft(testDb, actor, null, reimbursementSchema.parse({ note: "", items }));
      await submitReimbursement(testDb, actor, draft.reimbursementId);
      return draft.reimbursementId;
    };
    const andi = await submit(actors.andi, [row(), row({ paymentMethod: "CORPORATE", amount: 50_000, date: "2026-09-13" }), row({ date: "2026-10-01" })]);
    const sinta = await submit(actors.sinta, [row({ amount: 70_000 })]);
    await submit(actors.andi, [row({ amount: 5_000 })]);
    const draft = (await saveReimbursementDraft(testDb, actors.andi, null, reimbursementSchema.parse({ note: "", items: [row({ amount: 999_000 })] }))).reimbursementId;

    // Staf: pengajuan orang lain & draft diabaikan walau id-nya dikirim.
    const mine = await listReimburseExportRows(testDb, actors.andi, [andi, sinta, draft]);
    expect(mine.map((r) => [r.date, r.amount, r.paymentMethod, r.employeeName])).toEqual([
      ["2026-09-12", 100_000, "PERSONAL", "Andi Pratama"],
      ["2026-09-13", 50_000, "CORPORATE", "Andi Pratama"],
      ["2026-10-01", 100_000, "PERSONAL", "Andi Pratama"],
    ]);
    const all = await listReimburseExportRows(testDb, actors.ika, [andi, sinta]);
    expect(all.map((r) => r.amount)).toEqual([100_000, 50_000, 100_000, 70_000]);
    expect(all.some((r) => r.amount === 5_000)).toBe(false); // pengajuan yang tidak dipilih
    expect(await listReimburseExportRows(testDb, actors.ika, [])).toEqual([]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildReimburseWorkbook(all, "Rekap")).buffer as ArrayBuffer);
    const detail = wb.getWorksheet("Detail")!;
    expect(detail.getRow(1).getCell(3).value).toBe("No. Pengajuan");
    expect(detail.rowCount).toBe(1 + 4 + 1); // header + 4 baris + total
    expect(detail.getRow(2).getCell(16).value).toBe(100_000);
    const summary = wb.getWorksheet("Ringkasan")!;
    expect(summary.getRow(4).values).toEqual([undefined, "Andi Pratama", "", "Engineer", 1, 0, 250_000, 0, 200_000, 50_000]);
    expect(summary.getRow(5).getCell(1).value).toBe("Sinta Lestari");
  });
});
