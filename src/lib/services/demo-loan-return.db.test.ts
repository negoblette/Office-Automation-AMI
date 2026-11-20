// Alur pengembalian unit demo (revisi 2026-11-20, keputusan user): unit Rusak / Tidak lengkap → tindak lanjut DULU, baru
// hasil pengecekan + tindak lanjut diverifikasi engineer (approval DEMO_LOAN_RETURN, Ko Yosep). Ditolak → cek ulang unit.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDaysIso } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import { buildLoanFollowUpEmails } from "@/lib/mail/demo-loan-emails";
import { approveRequest, rejectRequest } from "@/lib/services/approval";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { createAsset } from "@/lib/services/asset";
import { markDemoLoanDelivered, resolveLoanFollowUp, returnDemoLoan, scheduleLoanPickup, setItemSender, submitDemoLoan } from "@/lib/services/demo-loan";
import { saveOperationalUsers } from "@/lib/services/inventory-access";
import { createRack } from "@/lib/services/storage-rack";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanSchema, resolveFollowUpSchema, returnDemoLoanSchema } from "@/lib/validators/demo-loan";
import { rackSchema } from "@/lib/validators/inventory";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;
let units: string[];
let rackId: string;

// Tanggal pengajuan tercatat `new Date()`, jadi semua tanggal alur memakai hari ini.
const TODAY = toJakartaIsoDate();

beforeEach(async () => {
  u = await resetAndSeed();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
  await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
  rackId = (await createRack(testDb, u.ika, rackSchema.parse({ name: "Rak 1", columns: 4, rows: 5, note: "" }))).id;
  units = [];
  for (const [serialNo, position] of [
    ["MUE00YP", "A1"],
    ["SW24001", "B2"],
  ]) {
    const asset = await createAsset(testDb, u.ika, assetSchema.parse({ deviceName: `Unit ${serialNo}`, serialNo, category: "DEMO_UNIT", rackId, rackPosition: position }));
    units.push(asset.id);
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};

const submit = async (key: string, assetIds: string[]) =>
  submitDemoLoan(
    testDb,
    await actor(key),
    demoLoanSchema.parse({
      purpose: "POC",
      assetIds,
      borrowerName: "PT Bank Uji",
      contactName: "Bapak Uji",
      contactEmail: "uji@bank.test",
      picId: emp.sinta,
      startDate: TODAY,
      dueDate: addDaysIso(TODAY, 30),
    }),
    TODAY,
  );

const requestOf = (module: "DEMO_LOAN" | "DEMO_LOAN_RETURN", entityId: string) =>
  testDb.approvalRequest.findUnique({ where: { module_entityId: { module, entityId } } });

/** Peminjaman kedua unit sampai barangnya dijadwalkan diambil (PICKUP). */
async function loanInPickup() {
  const { loanId } = await submit("sinta", units);
  await approveRequest(testDb, { requestId: (await requestOf("DEMO_LOAN", loanId))!.id, actorId: u.yosep });
  const devi = await actor("devi");
  await setItemSender(testDb, devi, loanId, { itemSenderId: emp.devi });
  await markDemoLoanDelivered(testDb, devi, loanId, { deliveredAt: TODAY, receivedByName: null }, TODAY);
  await scheduleLoanPickup(testDb, devi, loanId, { pickupDate: TODAY, courierId: emp.devi }, TODAY);
  const items = await testDb.demoLoanItem.findMany({ where: { loanId }, orderBy: { assetId: "asc" } });
  const itemOf = (assetId: string) => items.find((item) => item.assetId === assetId)!.id;
  return { loanId, items: units.map(itemOf) };
}

const check = (items: string[], conditions: ("GOOD" | "DAMAGED" | "INCOMPLETE")[]) =>
  returnDemoLoanSchema.parse({
    returnedAt: TODAY,
    items: items.map((itemId, index) => ({
      itemId,
      condition: conditions[index],
      note: conditions[index] === "GOOD" ? null : "Adaptor power tidak ada",
      rackId,
      rackPosition: "C3",
    })),
  });

const status = async (loanId: string) => (await testDb.demoLoan.findUniqueOrThrow({ where: { id: loanId } })).status;

describe("pengembalian: tindak lanjut sebelum verifikasi engineer (revisi 2026-11-20)", () => {
  it("unit bermasalah → Perlu Tindak Lanjut tanpa approval; selesai → verifikasi Ko Yosep → Selesai, unit bebas", async () => {
    const { loanId, items } = await loanInPickup();
    const devi = await actor("devi");

    const checked = await returnDemoLoan(testDb, devi, loanId, check(items, ["GOOD", "INCOMPLETE"]), TODAY);
    expect(checked).toMatchObject({ status: "FOLLOW_UP", notifications: [] });
    expect(await requestOf("DEMO_LOAN_RETURN", loanId)).toBeNull();
    // Email tindak lanjut pertama ke PIC (Sinta) & Operational (Devi).
    const emails = await buildLoanFollowUpEmails(testDb, loanId);
    expect(emails.map((email) => email.subject)).toEqual([expect.stringContaining("[Tindak Lanjut]"), expect.stringContaining("[Tindak Lanjut]")]);
    // Semua unit tertahan sampai verifikasi disetujui — juga unit yang kembali Baik.
    await expect(submit("andi", [units[0]])).rejects.toThrow("MUE00YP");

    const resolved = await resolveLoanFollowUp(
      testDb,
      devi,
      loanId,
      resolveFollowUpSchema.parse({ note: "Adaptor dikirim peminjam 21 Nov", items: [{ itemId: items[1], result: "RESOLVED" }] }),
    );
    expect(resolved.status).toBe("RETURN_REVIEW");
    expect(resolved.notifications).toEqual([expect.objectContaining({ template: "approval-requested", recipientIds: [u.yosep] })]);
    const [queued] = await listMyApprovalQueue(testDb, u.yosep);
    expect(queued).toMatchObject({ module: "DEMO_LOAN_RETURN", entityId: loanId, canApprove: true });
    expect(queued.summary).toContain("Tidak lengkap: Adaptor power tidak ada → tindak lanjut: sudah lengkap / sudah diperbaiki");
    expect(queued.summary).toContain("Catatan tindak lanjut: Adaptor dikirim peminjam 21 Nov");
    await expect(submit("andi", [units[0]])).rejects.toThrow("MUE00YP");

    await approveRequest(testDb, { requestId: queued.id, actorId: u.yosep });
    expect(await status(loanId)).toBe("RETURNED");
    expect(await buildLoanFollowUpEmails(testDb, loanId)).toEqual([]);
    await expect(submit("andi", units)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("semua Baik → langsung verifikasi; ditolak → cek ulang; hasil tindak lanjut lama hilang saat dicek ulang", async () => {
    const { loanId, items } = await loanInPickup();
    const devi = await actor("devi");

    expect((await returnDemoLoan(testDb, devi, loanId, check(items, ["GOOD", "GOOD"]), TODAY)).status).toBe("RETURN_REVIEW");
    await rejectRequest(testDb, { requestId: (await requestOf("DEMO_LOAN_RETURN", loanId))!.id, actorId: u.yosep, reason: "Switch kurang kabel console" });
    expect(await status(loanId)).toBe("PICKUP");

    // Cek ulang menemukan masalah → tindak lanjut dulu; tetap rusak → tetap diverifikasi, lalu ditolak lagi.
    expect((await returnDemoLoan(testDb, devi, loanId, check(items, ["GOOD", "DAMAGED"]), TODAY)).status).toBe("FOLLOW_UP");
    await resolveLoanFollowUp(testDb, devi, loanId, resolveFollowUpSchema.parse({ note: "Tidak bisa diperbaiki", items: [{ itemId: items[1], result: "UNRESOLVED" }] }));
    expect(await status(loanId)).toBe("RETURN_REVIEW");
    await rejectRequest(testDb, { requestId: (await requestOf("DEMO_LOAN_RETURN", loanId))!.id, actorId: u.yosep, reason: "Cek lagi port 3" });

    expect((await returnDemoLoan(testDb, devi, loanId, check(items, ["DAMAGED", "GOOD"]), TODAY)).status).toBe("FOLLOW_UP");
    const loan = await testDb.demoLoan.findUniqueOrThrow({ where: { id: loanId }, include: { items: true } });
    expect(loan).toMatchObject({ followUpNote: null, followUpResolvedAt: null });
    expect(loan.items.map((item) => item.resolvedCondition)).toEqual([null, null]);
    // Tindak lanjut hanya untuk unit yang bermasalah pada cek terakhir.
    await expect(
      resolveLoanFollowUp(testDb, devi, loanId, resolveFollowUpSchema.parse({ note: "Sudah beres", items: [{ itemId: items[1], result: "RESOLVED" }] })),
    ).rejects.toThrow("setiap unit yang rusak / tidak lengkap");
  });
});
