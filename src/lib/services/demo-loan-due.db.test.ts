// Tahap 16.4 (2026-11-18): pengingat jatuh tempo peminjaman unit, lonceng, perpanjangan lewat approval, dan kebersihan
// header email.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApprovalEmails } from "@/lib/mail/approval-emails";
import { renderEmail } from "@/lib/mail/render";
import { type MailTransport, processEmailJob } from "@/lib/mail/send-email";
import { toJakartaIsoDate } from "@/lib/format";
import { approveRequest, rejectRequest, revokeApproval } from "@/lib/services/approval";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { createAsset } from "@/lib/services/asset";
import { assetHistory } from "@/lib/services/asset-history";
import { markDemoLoanDelivered, returnDemoLoan, setItemSender, submitDemoLoan } from "@/lib/services/demo-loan";
import { cancelLoanExtension, requestLoanExtension } from "@/lib/services/demo-loan-extension";
import { getDemoLoanDetail } from "@/lib/services/demo-loan-queries";
import { loanDueReminders } from "@/lib/services/demo-loan-reminder";
import { saveOperationalUsers } from "@/lib/services/inventory-access";
import { dismissNotification, getNotifications } from "@/lib/services/notifications";
import { createRack } from "@/lib/services/storage-rack";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanExtensionSchema, demoLoanSchema, returnDemoLoanSchema } from "@/lib/validators/demo-loan";
import { rackSchema } from "@/lib/validators/inventory";
import { approvalFlowSchema } from "@/lib/validators/setting";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;
let units: string[];
const realToday = toJakartaIsoDate();

beforeEach(async () => {
  u = await resetAndSeed();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
  const rackId = (await createRack(testDb, u.ika, rackSchema.parse({ name: "Rak 1", columns: 4, rows: 5, note: "" }))).id;
  units = [];
  for (const [serialNo, position] of [
    ["MUE00YP", "A1"],
    ["MUJ203Z", "A2"],
  ]) {
    units.push((await createAsset(testDb, u.ika, assetSchema.parse({ deviceName: "SFP+ (10G)", serialNo, category: "DEMO_UNIT", rackId, rackPosition: position }))).id);
  }
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};
const viewer = async (key: string) => ({ ...(await actor(key)), isSuperAdmin: false });
const emailOf = async (key: string) => (await testDb.user.findUniqueOrThrow({ where: { id: u[key] } })).email;

/** Peminjaman Sinta (2 unit, 20 Nov – 19 Des 2026) yang sudah disetujui Ko Yosep & diantar Operational (Devi). */
async function deliveredLoan(assetIds = units) {
  await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
  const input = demoLoanSchema.parse({
    purpose: "POC",
    assetIds,
    borrowerName: "PT Bank\r\nBcc: korban@contoh.test",
    picName: "Bapak Surahman",
    picEmail: "surahman@danamon.co.id",
    salesPersonId: emp.sinta,
    startDate: "2026-11-20",
    dueDate: "2026-12-19",
  });
  const { loanId } = await submitDemoLoan(testDb, await actor("sinta"), input, "2026-11-17");
  const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "DEMO_LOAN", entityId: loanId } } });
  await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
  await setItemSender(testDb, await actor("devi"), loanId, { itemSenderId: emp.yosep });
  await markDemoLoanDelivered(testDb, await actor("devi"), loanId, { deliveredAt: realToday, receivedByName: null }, realToday);
  return loanId;
}

const extensionRequestOf = (extensionId: string) =>
  testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "DEMO_LOAN_EXTENSION", entityId: extensionId } }, include: { steps: true } });
const dueOf = async (loanId: string) => toJakartaIsoDate((await testDb.demoLoan.findUniqueOrThrow({ where: { id: loanId } })).dueDate);
const extend = async (key: string, loanId: string, newDueDate: string, today = "2026-12-12") =>
  requestLoanExtension(testDb, await actor(key), loanId, demoLoanExtensionSchema.parse({ newDueDate, reason: "POC diperpanjang customer" }), today);

describe("email pengingat jatuh tempo (worker harian)", () => {
  it("H-7, H-1, terlambat lalu tiap 7 hari — masing-masing sekali, hanya ke pemohon & Operational, balasan saling diarahkan", async () => {
    const loanId = await deliveredLoan();
    const [sinta, devi] = [await emailOf("sinta"), await emailOf("devi")];

    expect(await loanDueReminders(testDb, "2026-12-11")).toEqual([]); // H-8
    const soon = await loanDueReminders(testDb, "2026-12-12"); // H-7
    expect(soon.map((email) => email.to).sort()).toEqual([devi, sinta].sort());
    expect(soon.every((email) => email.template === "loan-due-soon" && email.subject.includes("jatuh tempo 7 hari lagi"))).toBe(true);
    // PIC perusahaan peminjam tidak pernah dikirimi.
    expect(soon.some((email) => email.to === "surahman@danamon.co.id")).toBe(false);
    expect(soon.find((email) => email.to === sinta)?.replyTo).toEqual([devi]);
    expect(soon.find((email) => email.to === devi)?.replyTo).toEqual([sinta]);

    // Tidak dobel: hari yang sama / tahap yang sama → kosong.
    expect(await loanDueReminders(testDb, "2026-12-12")).toEqual([]);
    expect(await loanDueReminders(testDb, "2026-12-15")).toEqual([]);
    expect((await loanDueReminders(testDb, "2026-12-18")).map((email) => email.subject)).toEqual([
      expect.stringContaining("jatuh tempo besok"),
      expect.stringContaining("jatuh tempo besok"),
    ]);
    expect(await loanDueReminders(testDb, "2026-12-19")).toEqual([]);
    const late = await loanDueReminders(testDb, "2026-12-20");
    expect(late.map((email) => [email.template, email.subject.startsWith("[Terlambat]"), email.subject.includes("terlambat 1 hari")])).toEqual([
      ["loan-overdue", true, true],
      ["loan-overdue", true, true],
    ]);
    expect(await loanDueReminders(testDb, "2026-12-26")).toEqual([]);
    expect((await loanDueReminders(testDb, "2026-12-27")).every((email) => email.subject.includes("terlambat 8 hari"))).toBe(true);
    expect(await testDb.demoLoanReminder.count({ where: { loanId } })).toBe(4);

    // Isi email: rincian unit & jatuh tempo, footer balasan; teks isian user di-escape.
    const { html, text } = await renderEmail(late[0].template, late[0].props);
    expect(text).toContain("MUE00YP");
    expect(text).toMatch(/Membalas email ini akan terkirim ke (Operational \(Devi\)|pemohon \(Sinta Lestari\))/);
    expect(html).not.toContain("<script");
  });

  it("worker mati beberapa hari → hanya tahap terbaru; belum diantar / pemohon nonaktif / Operational belum diatur", async () => {
    const loanId = await deliveredLoan();
    // Pertama kali jalan saat sudah terlambat 3 hari: satu tahap saja (terlambat), bukan H-7 + H-1 + terlambat.
    const first = await loanDueReminders(testDb, "2026-12-22");
    expect(first).toHaveLength(2);
    expect(first.every((email) => email.template === "loan-overdue" && email.subject.includes("terlambat 3 hari"))).toBe(true);

    // Pemohon nonaktif → hanya Operational; Operational dikosongkan → Admin aktif.
    await testDb.user.update({ where: { id: u.sinta }, data: { isActive: false } });
    expect((await loanDueReminders(testDb, "2026-12-27")).map((email) => email.to)).toEqual([await emailOf("devi")]);
    await saveOperationalUsers(testDb, u.ika, { userIds: [] });
    const admins = await testDb.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } });
    expect((await loanDueReminders(testDb, "2027-01-03")).map((email) => email.to).sort()).toEqual(admins.map((a) => a.email).sort());
    expect(loanId).toBeTruthy();
  });

  it("peminjaman yang belum diantar atau sudah kembali tidak diingatkan", async () => {
    await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
    const input = demoLoanSchema.parse({
      purpose: "POC",
      assetIds: [units[0]],
      borrowerName: "PT Belum Diantar",
      picName: "Pak Budi",
      picEmail: "budi@contoh.test",
      salesPersonId: emp.sinta,
      startDate: "2026-11-20",
      dueDate: "2026-12-19",
    });
    const { loanId } = await submitDemoLoan(testDb, await actor("sinta"), input, "2026-11-17");
    const request = await testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "DEMO_LOAN", entityId: loanId } } });
    await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
    expect(await loanDueReminders(testDb, "2026-12-25")).toEqual([]);
  });
});

describe("lonceng jatuh tempo", () => {
  it("pemohon & Operational melihatnya, user lain tidak; dihapus → muncul lagi saat terlambat", async () => {
    const loanId = await deliveredLoan();
    const now = new Date("2026-12-14T03:00:00Z");
    const dueItems = async (key: string, today: string) =>
      (await getNotifications(testDb, await viewer(key), today, now)).filter((item) => item.key.startsWith("loandue:"));

    expect(await dueItems("sinta", "2026-12-11")).toEqual([]);
    const [soon] = await dueItems("sinta", "2026-12-14");
    expect(soon).toMatchObject({ kind: "loan", tone: "warning", href: `/inventory/peminjaman/${loanId}`, title: expect.stringContaining("jatuh tempo 5 hari lagi") });
    expect(await dueItems("devi", "2026-12-14")).toHaveLength(1);
    expect(await dueItems("andi", "2026-12-14")).toEqual([]);
    expect(await dueItems("yosep", "2026-12-14")).toEqual([]);

    await dismissNotification(testDb, await viewer("sinta"), { key: soon.key }, "2026-12-14", now);
    expect(await dueItems("sinta", "2026-12-16")).toEqual([]);
    const [late] = await dueItems("sinta", "2026-12-21");
    expect(late).toMatchObject({ tone: "danger", title: expect.stringContaining("terlambat 2 hari") });
  });
});

describe("perpanjangan jatuh tempo", () => {
  it("aturan pengajuan: siapa, kapan, dan batas tanggal", async () => {
    const loanId = await deliveredLoan();
    await expect(extend("andi", loanId, "2027-01-19")).rejects.toThrow("Hanya pemohon peminjaman, Operational, atau Admin");
    await expect(extend("sinta", loanId, "2026-12-19")).rejects.toMatchObject({ message: "Tanggal selesai baru harus setelah jatuh tempo sekarang", field: "newDueDate" });
    await expect(extend("sinta", loanId, "2026-12-22", "2026-12-25")).rejects.toThrow("tidak boleh sebelum hari ini");
    await expect(extend("sinta", loanId, "2028-11-20")).rejects.toThrow("maksimal 2 tahun");
    expect(() => demoLoanExtensionSchema.parse({ newDueDate: "2027-01-19", reason: "ok" })).toThrow("minimal 5 karakter");
    // Modul perpanjangan tidak bisa diberi Approval Flow sendiri (memakai flow Peminjaman Unit).
    expect(approvalFlowSchema.safeParse({ module: "DEMO_LOAN_EXTENSION", division: "", steps: [{ approverIds: [u.yosep] }] }).success).toBe(false);
    expect(await testDb.demoLoanExtension.count()).toBe(0);
  });

  it("disetujui Ko Yosep → jatuh tempo pindah, pengingat mulai lagi, tercatat di riwayat; dibatalkan persetujuannya → kembali", async () => {
    const loanId = await deliveredLoan();
    expect(await loanDueReminders(testDb, "2026-12-12")).toHaveLength(2);

    const result = await extend("sinta", loanId, "2027-01-19");
    expect(result.status).toBe("PENDING");
    expect(result.notifications).toEqual([expect.objectContaining({ template: "approval-requested", recipientIds: [u.yosep] })]);
    await expect(extend("devi", loanId, "2027-02-19")).rejects.toThrow("Masih ada perpanjangan yang menunggu approval");

    const queue = await listMyApprovalQueue(testDb, u.yosep);
    const row = queue.find((r) => r.module === "DEMO_LOAN_EXTENSION")!;
    expect(row.headline).toContain("19 Des 2026 → 19 Jan 2027");
    expect(row.summary).toContain("Alasan: POC diperpanjang customer");
    const [requested] = await buildApprovalEmails(testDb, result.notifications[0]);
    expect(requested.subject).toContain("[Approval] Perpanjangan Peminjaman Unit");
    expect((requested.props as { details: string[] }).details).toContain("Jatuh tempo: 19 Desember 2026 → 19 Januari 2027");

    const request = await extensionRequestOf(result.extensionId);
    const approved = await approveRequest(testDb, { requestId: request.id, actorId: u.yosep });
    expect(approved.status).toBe("APPROVED");
    const [final] = await buildApprovalEmails(testDb, approved.notifications[0]);
    expect(final.props.url).toContain(`/inventory/peminjaman/perpanjangan/${result.extensionId}`);
    expect(await dueOf(loanId)).toBe("2027-01-19");
    const detail = (await getDemoLoanDetail(testDb, loanId, "2026-12-12"))!;
    expect(detail.extensions).toEqual([expect.objectContaining({ status: "APPROVED", previousDueDate: "2026-12-19", newDueDate: "2027-01-19" })]);
    expect(detail.daysLeft).toBe(38);

    // Pengingat untuk jatuh tempo baru dimulai lagi dari H-7.
    expect(await loanDueReminders(testDb, "2026-12-20")).toEqual([]);
    expect((await loanDueReminders(testDb, "2027-01-12")).every((email) => email.subject.includes("7 hari lagi"))).toBe(true);

    const history = await assetHistory(testDb, units[0]);
    expect(history.find((event) => event.title === "Jatuh tempo diperpanjang")?.note).toContain("19 Des 2026 → 19 Jan 2027");

    // Approver membatalkan persetujuannya → jatuh tempo kembali, perpanjangan menunggu lagi, lalu ditolak.
    await revokeApproval(testDb, { requestId: request.id, actorId: u.yosep, reason: "Salah tanggal" });
    expect(await dueOf(loanId)).toBe("2026-12-19");
    expect((await testDb.demoLoanExtension.findUniqueOrThrow({ where: { id: result.extensionId } })).status).toBe("PENDING");
    await rejectRequest(testDb, { requestId: request.id, actorId: u.yosep, reason: "Unit dibutuhkan demo lain" });
    expect((await testDb.demoLoanExtension.findUniqueOrThrow({ where: { id: result.extensionId } })).status).toBe("REJECTED");
    expect(await dueOf(loanId)).toBe("2026-12-19");
    const rejectedBell = (await getNotifications(testDb, await viewer("sinta"), "2026-12-12")).find((item) => item.kind === "rejected");
    expect(rejectedBell).toMatchObject({ title: expect.stringContaining("Perpanjangan Peminjaman Unit"), detail: "Jatuh tempo tidak berubah" });
    // Ditolak → boleh mengajukan perpanjangan baru.
    expect((await extend("sinta", loanId, "2027-01-05")).status).toBe("PENDING");
  });

  it("dibatalkan pengaju (bukan 'ditolak'); barang kembali → perpanjangan yang menunggu ditutup otomatis", async () => {
    const loanId = await deliveredLoan();
    const mine = await extend("sinta", loanId, "2027-01-19");
    await expect(cancelLoanExtension(testDb, await actor("devi"), mine.extensionId)).rejects.toThrow("Hanya yang mengajukan");
    await cancelLoanExtension(testDb, await actor("sinta"), mine.extensionId);
    expect((await extensionRequestOf(mine.extensionId)).status).toBe("REJECTED");
    expect((await listMyApprovalQueue(testDb, u.yosep)).some((r) => r.module === "DEMO_LOAN_EXTENSION")).toBe(false);
    expect((await getNotifications(testDb, await viewer("sinta"), "2026-12-12")).some((item) => item.kind === "rejected")).toBe(false);

    // Operational mengajukan atas nama pemohon, lalu barang keburu kembali.
    const ops = await extend("devi", loanId, "2027-01-19");
    const items = await testDb.demoLoanItem.findMany({ where: { loanId } });
    await returnDemoLoan(
      testDb,
      await actor("devi"),
      loanId,
      returnDemoLoanSchema.parse({ returnedAt: realToday, items: items.map((item) => ({ itemId: item.id, condition: "GOOD", rackId: "", rackPosition: "" })) }),
      realToday,
    );
    expect((await testDb.demoLoanExtension.findUniqueOrThrow({ where: { id: ops.extensionId } })).status).toBe("CANCELLED");
    const request = await extensionRequestOf(ops.extensionId);
    expect(request.status).toBe("REJECTED");
    expect(request.steps[0].note).toBe("Barang sudah kembali");
    await expect(approveRequest(testDb, { requestId: request.id, actorId: u.yosep })).rejects.toThrow("sudah diproses");
    await expect(extend("sinta", loanId, "2027-02-19")).rejects.toThrow("sedang dipinjam");
    expect(await loanDueReminders(testDb, "2026-12-25")).toEqual([]);
  });
});

describe("kebersihan header email (secure coding)", () => {
  it("subjek tanpa baris baru, Reply-To hanya alamat valid, penerima harus satu alamat", async () => {
    const sent: Record<string, unknown>[] = [];
    const transport = { sendMail: async (options: Record<string, unknown>) => void sent.push(options) } as unknown as MailTransport;
    const log = async () => (await testDb.emailLog.create({ data: { to: "x", subject: "x", template: "loan-overdue" } })).id;
    const props = { template: "loan-overdue" as const, recipientName: "Sinta", requesterName: "Sinta", borrowerName: "PT <b>X</b>", number: "001", statusLine: "ok", details: [], url: "http://localhost:3000/" };

    await processEmailJob(testDb, transport, {
      emailLogId: await log(),
      to: "sinta@artha-mitra.local",
      subject: "[Terlambat] PT Bank\r\nBcc: korban@contoh.test",
      template: "loan-overdue",
      props,
      replyTo: ["devi@artha-mitra.local", "a@b.c, korban@contoh.test", "x\r\n@y.z"],
    });
    expect(sent[0]).toMatchObject({ subject: "[Terlambat] PT Bank Bcc: korban@contoh.test", replyTo: ["devi@artha-mitra.local"] });
    expect(String(sent[0].html)).toContain("PT &lt;b&gt;X&lt;/b&gt;");

    const bad = await log();
    await expect(
      processEmailJob(testDb, transport, { emailLogId: bad, to: "a@b.c, korban@contoh.test", subject: "x", template: "loan-overdue", props }),
    ).rejects.toThrow("Alamat penerima tidak valid");
    expect(await testDb.emailLog.findUniqueOrThrow({ where: { id: bad } })).toMatchObject({ status: "FAILED" });
    expect(sent).toHaveLength(1);
  });
});
