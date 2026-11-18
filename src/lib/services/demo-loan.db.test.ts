import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApprovalEmails } from "@/lib/mail/approval-emails";
import { buildDemoLoanEmails } from "@/lib/mail/demo-loan-emails";
import { renderEmail } from "@/lib/mail/render";
import type { ApprovalEmailProps } from "@/lib/mail/templates/approval-email";
import { approveRequest, rejectRequest, revokeApproval } from "@/lib/services/approval";
import { listMyApprovalQueue } from "@/lib/services/approval-queries";
import { createAsset, deleteAsset, updateAsset } from "@/lib/services/asset";
import { assetHistory } from "@/lib/services/asset-history";
import { listAssets } from "@/lib/services/asset-queries";
import { addDaysIso } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import {
  cancelDemoLoan,
  getFormCounter,
  getTrialFormCounter,
  markDemoLoanDelivered,
  returnDemoLoan,
  reviseDemoLoan,
  setFormCounter,
  setItemSender,
  setTrialFormCounter,
  submitDemoLoan,
} from "@/lib/services/demo-loan";
import { getDemoLoanDetail, getLoanFormOptions, listDemoLoans } from "@/lib/services/demo-loan-queries";
import { saveOperationalUsers } from "@/lib/services/inventory-access";
import { dismissNotification, getNotifications } from "@/lib/services/notifications";
import { createRack } from "@/lib/services/storage-rack";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanSchema, returnDemoLoanSchema } from "@/lib/validators/demo-loan";
import { rackSchema } from "@/lib/validators/inventory";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;
let units: Record<string, string>;
let rackId: string;

const TODAY = "2026-11-17";
const NOW = new Date("2026-11-17T03:00:00Z"); // 10:00 WIB

beforeEach(async () => {
  u = await resetAndSeed();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
  rackId = (await createRack(testDb, u.ika, rackSchema.parse({ name: "Rak 1", columns: 4, rows: 5, note: "" }))).id;
  units = {};
  for (const [serialNo, position] of [
    ["MUE00YP", "A1"],
    ["MUJ203Z", "A1"],
    ["SW24001", "B2"],
  ]) {
    const deviceName = serialNo.startsWith("SW") ? "Switch 24 port" : "SFP+ (10G)";
    const asset = await createAsset(testDb, u.ika, assetSchema.parse({ deviceName, serialNo, category: "DEMO_UNIT", rackId, rackPosition: position }));
    units[serialNo] = asset.id;
  }
  await testDb.customer.create({ data: { name: "PT Bank Danamon Indonesia" } });
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};

const input = (overrides: Record<string, unknown> = {}) =>
  demoLoanSchema.parse({
    purpose: "BACKUP_UNIT",
    assetIds: [units.MUE00YP, units.MUJ203Z],
    borrowerName: "pt bank danamon indonesia",
    picName: "Bapak Surahman",
    picEmail: "surahman@danamon.co.id",
    salesPersonId: emp.sinta,
    startDate: "2026-11-20",
    dueDate: "2026-12-19",
    remarks: "Pengganti sementara switch customer yang rusak",
    ...overrides,
  });

const submit = async (key: string, overrides: Record<string, unknown> = {}) => submitDemoLoan(testDb, await actor(key), input(overrides), TODAY);
const requestOf = (loanId: string) => testDb.approvalRequest.findUniqueOrThrow({ where: { module_entityId: { module: "DEMO_LOAN", entityId: loanId } }, include: { steps: true } });
const approveByYosep = async (loanId: string) => approveRequest(testDb, { requestId: (await requestOf(loanId)).id, actorId: u.yosep });
const rejectByYosep = async (loanId: string, reason = "Unit dipakai demo internal") => rejectRequest(testDb, { requestId: (await requestOf(loanId)).id, actorId: u.yosep, reason });
const loanRow = (loanId: string) => testDb.demoLoan.findUniqueOrThrow({ where: { id: loanId }, include: { items: { orderBy: { id: "asc" } } } });
const viewer = async (key: string) => ({ ...(await actor(key)), isSuperAdmin: false });

describe("pengajuan peminjaman (Fase 16.2, revisi 2026-11-17)", () => {
  it("Sales mengajukan: nomor form terbit, approval ke Ko Yosep, peminjam ditautkan ke Customer, unit & posisi disalin", async () => {
    const result = await submit("sinta");
    expect(result).toMatchObject({ number: "001/AMI-PTF/XI/2026", status: "PENDING" });
    expect(result.notifications).toEqual([expect.objectContaining({ template: "approval-requested", recipientIds: [u.yosep] })]);

    const loan = await loanRow(result.loanId);
    expect(loan).toMatchObject({ status: "PENDING", purpose: "BACKUP_UNIT", borrowerName: "PT Bank Danamon Indonesia", requesterId: u.sinta });
    expect(loan.customerId).not.toBeNull();
    expect(loan.dueDate.toISOString().slice(0, 10)).toBe("2026-12-19");
    expect(loan.items.map((item) => [item.serialNo, item.rackPosition])).toEqual([
      ["MUE00YP", "A1"],
      ["MUJ203Z", "A1"],
    ]);
    const request = await requestOf(result.loanId);
    expect(request).toMatchObject({ status: "PENDING", entityNumber: "001/AMI-PTF/XI/2026", currentLevel: 1 });

    // Antrian Ko Yosep di Approval Center berisi ringkasan peminjaman.
    const [row] = await listMyApprovalQueue(testDb, u.yosep);
    expect(row).toMatchObject({ module: "DEMO_LOAN", canApprove: true, headline: "Backup Unit · PT Bank Danamon Indonesia · 2 unit" });
    expect(row.summary).toContain("SFP+ (10G) · SN MUE00YP · Rak 1 A1");

    // Nama yang tidak ada di Customer tetap tersimpan apa adanya; nomor berikutnya urut.
    const typed = await submit("andi", { purpose: "POC", assetIds: [units.SW24001], borrowerName: "PT Baru Sekali" });
    expect(typed.number).toBe("002/AMI-PTF/XI/2026");
    expect(await loanRow(typed.loanId)).toMatchObject({ borrowerName: "PT Baru Sekali", customerId: null, purpose: "POC" });
    expect(await testDb.customer.count()).toBe(1);
  });

  it("unit yang sedang diajukan tidak bisa diajukan lagi; dibatalkan → unit bebas & approval ditutup (bukan 'ditolak')", async () => {
    const first = await submit("sinta", { assetIds: [units.MUE00YP] });
    await expect(submit("andi", { assetIds: [units.MUJ203Z, units.MUE00YP] })).rejects.toThrow("SFP+ (10G) (SN MUE00YP)");
    const options = await getLoanFormOptions(testDb);
    expect(options.units.find((unit) => unit.id === units.MUE00YP)?.unavailable).toBe("Menunggu approval · PT Bank Danamon Indonesia");
    expect(options.salesPeople.map((option) => option.value).sort()).toEqual([emp.darwin, emp.sinta].sort());
    expect((await getLoanFormOptions(testDb, first.loanId)).units.find((unit) => unit.id === units.MUE00YP)?.unavailable).toBeNull();

    await expect(cancelDemoLoan(testDb, await actor("andi"), first.loanId)).rejects.toThrow("Hanya pemohon");
    await cancelDemoLoan(testDb, await actor("sinta"), first.loanId);
    const request = await requestOf(first.loanId);
    expect(request.status).toBe("REJECTED");
    expect(request.steps[0]).toMatchObject({ status: "REJECTED", note: "Dibatalkan pemohon" });
    expect(await listMyApprovalQueue(testDb, u.yosep)).toEqual([]);
    // Pembatalan bukan penolakan: tidak muncul "ditolak" di lonceng pemohon.
    expect((await getNotifications(testDb, await viewer("sinta"), TODAY, NOW)).some((item) => item.kind === "rejected")).toBe(false);

    await expect(submit("andi", { assetIds: [units.MUE00YP] })).resolves.toMatchObject({ status: "PENDING" });
  });

  it("aturan pengajuan: akses, Sales Person, tanggal mulai, unit", async () => {
    await expect(submit("devi")).rejects.toThrow("tidak punya akses"); // Umum, belum Operational
    await expect(submit("sinta", { salesPersonId: emp.andi })).rejects.toThrow("Sales Person harus karyawan aktif divisi Sales");
    await expect(submit("sinta", { startDate: "2026-11-16" })).rejects.toThrow("Tanggal mulai tidak boleh sebelum hari ini");
    await expect(submit("sinta", { startDate: "2027-12-01", dueDate: "2027-12-31" })).rejects.toThrow("paling lambat 1 tahun");
    await expect(submit("sinta", { assetIds: ["tidak-ada"] })).rejects.toThrow("tidak ditemukan atau sudah dihapus");
    expect(await testDb.demoLoan.count()).toBe(0);
    expect(demoLoanSchema.safeParse({ ...input(), purpose: "" }).error?.issues[0].message).toBe("Pilih kegunaan peminjaman");
  });
});

describe("approval Ko Yosep → antrian Operational", () => {
  it("disetujui: masuk antrian Operational (lonceng & email), Item Sender dipilih Operational, unit tetap tertahan", async () => {
    await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
    const { loanId } = await submit("sinta", { assetIds: [units.MUE00YP] });

    const result = await approveByYosep(loanId);
    expect(result.status).toBe("APPROVED");
    const loan = await loanRow(loanId);
    expect(loan.status).toBe("APPROVED");
    expect(loan.approvedAt).not.toBeNull();

    // Lonceng Devi (Operational): peminjaman siap disiapkan; Andi (Engineer biasa) tidak.
    const devi = await viewer("devi");
    expect((await getNotifications(testDb, devi, TODAY, NOW)).find((item) => item.key === "loanqueue")).toMatchObject({ kind: "loan", seen: [loanId] });
    expect((await getNotifications(testDb, await viewer("andi"), TODAY, NOW)).some((item) => item.key === "loanqueue")).toBe(false);
    await dismissNotification(testDb, devi, { key: "loanqueue", seen: [loanId] }, TODAY, NOW);
    expect((await getNotifications(testDb, devi, TODAY, NOW)).some((item) => item.key === "loanqueue")).toBe(false);
    const second = await submit("andi", { assetIds: [units.SW24001] });
    await approveByYosep(second.loanId);
    expect((await getNotifications(testDb, devi, TODAY, NOW)).find((item) => item.key === "loanqueue")?.seen).toEqual([loanId, second.loanId]);

    // Email ke Operational setelah disetujui final.
    const [ready] = await buildDemoLoanEmails(testDb, loanId, "loan-approved");
    expect(ready).toMatchObject({ to: "devi@artha-mitra.local", subject: "[Peminjaman Unit] Siapkan 001/AMI-PTF/XI/2026 — PT Bank Danamon Indonesia" });
    const { text } = await renderEmail("loan-approved", ready.props);
    expect(text.toLowerCase()).toContain("siapkan barang & cetak form");

    // Item Sender: Operational / Admin saja, karyawan aktif.
    await expect(setItemSender(testDb, await actor("andi"), loanId, { itemSenderId: emp.yosep })).rejects.toThrow("Hanya Operational & Admin");
    await expect(setItemSender(testDb, await actor("devi"), loanId, { itemSenderId: "tidak-ada" })).rejects.toThrow("Item Sender harus karyawan aktif");
    await setItemSender(testDb, await actor("devi"), loanId, { itemSenderId: emp.yosep });
    expect((await getDemoLoanDetail(testDb, loanId, TODAY))?.itemSenderName).toBe("Yosep");

    // Sudah disetujui: pemohon tidak bisa ubah / batal; unit tetap tertahan.
    await expect(cancelDemoLoan(testDb, await actor("sinta"), loanId)).rejects.toThrow("sudah disetujui");
    await expect(reviseDemoLoan(testDb, await actor("sinta"), loanId, input(), TODAY)).rejects.toThrow("sudah disetujui");
    await expect(submit("andi", { assetIds: [units.MUE00YP] })).rejects.toThrow("MUE00YP");
    expect((await listAssets(testDb, units.MUE00YP))[0]).toMatchObject({ loanCount: 1, activeLoan: { status: "APPROVED" } });

    // Persetujuan dibatalkan (approver/Admin) sebelum diantar → kembali menunggu, Item Sender dikosongkan.
    await revokeApproval(testDb, { requestId: (await requestOf(loanId)).id, actorId: u.yosep, reason: "Cek ulang unit" });
    expect(await loanRow(loanId)).toMatchObject({ status: "PENDING", approvedAt: null, itemSenderId: null });
  });

  it("ditolak → pemohon revisi & ajukan ulang (nomor sama, approval dari awal) atau batalkan", async () => {
    const { loanId, number } = await submit("sinta");
    await expect(rejectRequest(testDb, { requestId: (await requestOf(loanId)).id, actorId: u.andi, reason: "bukan approver" })).rejects.toThrow();
    await rejectByYosep(loanId);
    expect((await loanRow(loanId)).status).toBe("REJECTED");
    const detail = await getDemoLoanDetail(testDb, loanId, TODAY);
    expect(detail?.approval.rejection).toMatchObject({ reason: "Unit dipakai demo internal", by: "Yosep" });
    const rejected = (await getNotifications(testDb, await viewer("sinta"), TODAY, new Date())).find((item) => item.kind === "rejected");
    expect(rejected).toMatchObject({ title: `Peminjaman Unit ${number} ditolak`, href: `/inventory/peminjaman/${loanId}` });

    await expect(reviseDemoLoan(testDb, await actor("andi"), loanId, input(), TODAY)).rejects.toThrow("Hanya pemohon");
    const revised = await reviseDemoLoan(testDb, await actor("sinta"), loanId, input({ assetIds: [units.SW24001], dueDate: "2026-12-03" }), TODAY);
    expect(revised.resubmitted).toBe(true);
    expect(revised.notifications).toEqual([expect.objectContaining({ template: "approval-requested", recipientIds: [u.yosep] })]);
    const loan = await loanRow(loanId);
    expect(loan).toMatchObject({ status: "PENDING", number });
    expect(loan.dueDate.toISOString().slice(0, 10)).toBe("2026-12-03");
    expect(loan.items.map((item) => item.serialNo)).toEqual(["SW24001"]);
    expect((await requestOf(loanId)).status).toBe("PENDING");
    // Unit yang dilepas langsung bebas.
    await expect(submit("andi", { assetIds: [units.MUE00YP] })).resolves.toMatchObject({ status: "PENDING" });

    // Mengubah pengajuan yang masih menunggu bukan "ajukan ulang" (approval tetap yang sama).
    const again = await reviseDemoLoan(testDb, await actor("sinta"), loanId, input({ assetIds: [units.SW24001] }), TODAY);
    expect(again).toMatchObject({ resubmitted: false, notifications: [] });
  });

  it("unit yang pernah diajukan tidak bisa dihapus", async () => {
    const { loanId } = await submit("sinta", { assetIds: [units.MUE00YP] });
    await cancelDemoLoan(testDb, await actor("sinta"), loanId);
    await expect(deleteAsset(testDb, u.ika, units.MUE00YP)).rejects.toThrow("pernah diajukan pinjam");
    await expect(deleteAsset(testDb, u.ika, units.SW24001)).resolves.toBeUndefined();
  });
});

describe("kegunaan 'Lainnya' & unit titipan principal (2026-11-17)", () => {
  it("detail kegunaan tersimpan & tampil; unit principal bisa dipinjamkan, ditandai di pilihan & Approval Center", async () => {
    await updateAsset(testDb, u.ika, units.SW24001, assetSchema.parse({ deviceName: "Switch 24 port", serialNo: "SW24001", category: "DEMO_UNIT", rackId, rackPosition: "B2", ownership: "PRINCIPAL", ownerName: "Cisco" }));
    const [row] = await listAssets(testDb, units.SW24001);
    expect(row).toMatchObject({ ownership: "PRINCIPAL", ownerName: "Cisco" });
    const option = (await getLoanFormOptions(testDb)).units.find((unit) => unit.id === units.SW24001);
    expect(option).toMatchObject({ ownership: "PRINCIPAL", ownerLabel: "Principal · Cisco" });
    const edit = (await assetHistory(testDb, units.SW24001)).find((event) => event.kind === "updated");
    expect(edit?.changes).toEqual(
      expect.arrayContaining([
        { label: "Kepemilikan", before: "Milik AMI", after: "Principal" },
        { label: "Nama principal / distributor", before: "—", after: "Cisco" },
      ]),
    );

    const { loanId } = await submit("sinta", { purpose: "OTHER", purposeDetail: "Unit pameran di event customer", assetIds: [units.SW24001] });
    expect(await loanRow(loanId)).toMatchObject({ purpose: "OTHER", purposeDetail: "Unit pameran di event customer" });
    const [queue] = await listMyApprovalQueue(testDb, u.yosep);
    expect(queue.headline).toBe("Unit pameran di event customer · PT Bank Danamon Indonesia · 1 unit");
    expect(queue.summary).toContain("Switch 24 port · SN SW24001 · Rak 1 B2 · Principal · Cisco");
    expect((await listDemoLoans(testDb, TODAY))[0]).toMatchObject({ purpose: "OTHER", purposeDetail: "Unit pameran di event customer" });

    // Detail diabaikan untuk kegunaan selain "Lainnya".
    const poc = await submit("andi", { purpose: "POC", purposeDetail: "tidak dipakai", assetIds: [units.MUE00YP] });
    expect((await loanRow(poc.loanId)).purposeDetail).toBeNull();
  });
});

describe("cetak & pengantaran (Tahap 16.3)", () => {
  it("Sudah Diantar: wajib Item Sender, tanggal wajar; status Dipinjam, tercatat di riwayat unit, keluar dari antrian Operational", async () => {
    await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
    const { loanId } = await submit("sinta", { assetIds: [units.MUE00YP] });
    const deliver = async (key: string, values: { deliveredAt: string; receivedByName: string | null }, today = "2026-11-21") =>
      markDemoLoanDelivered(testDb, await actor(key), loanId, values, today);

    await expect(deliver("devi", { deliveredAt: "2026-11-21", receivedByName: null })).rejects.toThrow("sudah disetujui dan belum diantar"); // belum disetujui
    await approveByYosep(loanId);
    await expect(deliver("devi", { deliveredAt: "2026-11-21", receivedByName: null })).rejects.toThrow("Pilih Item Sender");
    await setItemSender(testDb, await actor("devi"), loanId, { itemSenderId: emp.yosep });
    expect(await getDemoLoanDetail(testDb, loanId, TODAY)).toMatchObject({ operationalName: "Devi", itemSenderName: "Yosep", deliveredAt: null });

    await expect(deliver("andi", { deliveredAt: "2026-11-21", receivedByName: null })).rejects.toThrow("Hanya Operational & Admin");
    await expect(deliver("devi", { deliveredAt: "2026-11-22", receivedByName: null })).rejects.toThrow("masa depan");
    const submitted = (await loanRow(loanId)).submittedAt;
    const before = new Date(submitted.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
    await expect(deliver("devi", { deliveredAt: before, receivedByName: null }, before)).rejects.toThrow("sebelum tanggal pengajuan");

    const today = new Date().toISOString().slice(0, 10) > "2026-11-21" ? new Date().toISOString().slice(0, 10) : "2026-11-21";
    await deliver("devi", { deliveredAt: today, receivedByName: "Muh Jawad Azzak" }, today);
    const detail = await getDemoLoanDetail(testDb, loanId, today);
    expect(detail).toMatchObject({ status: "ON_LOAN", deliveredAt: today, receivedByName: "Muh Jawad Azzak", overdue: false });
    expect((await getDemoLoanDetail(testDb, loanId, "2027-01-01"))?.overdue).toBe(true); // lewat jatuh tempo 19 Des

    expect((await getNotifications(testDb, await viewer("devi"), TODAY, NOW)).some((item) => item.key === "loanqueue")).toBe(false);
    expect((await assetHistory(testDb, units.MUE00YP))[0].title).toBe("Diantar ke peminjam");
    expect((await listAssets(testDb, units.MUE00YP))[0].activeLoan?.status).toBe("ON_LOAN");
    // Sudah diantar: persetujuan tidak bisa dibatalkan, Item Sender tidak bisa diganti.
    await expect(revokeApproval(testDb, { requestId: (await requestOf(loanId)).id, actorId: u.yosep, reason: "Cek ulang" })).rejects.toThrow("Barang sudah diantar");
    await expect(setItemSender(testDb, await actor("devi"), loanId, { itemSenderId: emp.andi })).rejects.toThrow("belum diantar");
  });
});

describe("pengembalian & Hardware Admission Form (Tahap 16.5)", () => {
  // Tanggal pengajuan = jam sungguhan (submittedAt), jadi tanggal antar & kembali mengikuti hari ini.
  const realToday = toJakartaIsoDate();

  /** Peminjaman 2 unit (posisi A1) yang sudah disetujui & diantar hari ini. */
  const deliveredLoan = async () => {
    await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
    const result = await submit("sinta");
    await approveByYosep(result.loanId);
    await setItemSender(testDb, await actor("devi"), result.loanId, { itemSenderId: emp.yosep });
    await markDemoLoanDelivered(testDb, await actor("devi"), result.loanId, { deliveredAt: realToday, receivedByName: "Muh Jawad Azzak" }, realToday);
    const items = (await loanRow(result.loanId)).items;
    const itemOf = (assetId: string) => items.find((item) => item.assetId === assetId)!.id;
    return { ...result, first: itemOf(units.MUE00YP), second: itemOf(units.MUJ203Z) };
  };

  const values = (checks: Record<string, unknown>[], overrides: Record<string, unknown> = {}) =>
    returnDemoLoanSchema.parse({ returnedAt: realToday, returnedByName: "Bapak Surahman", note: "Kardus lengkap", items: checks, ...overrides });

  it("Operational mengecek tiap unit & menaruhnya di rak → Selesai, HAF terbit, unit tersedia lagi dengan catatan kondisi", async () => {
    const { loanId, number, first, second } = await deliveredLoan();
    const good = { itemId: first, condition: "GOOD", note: "", rackId, rackPosition: "A1" };
    const damaged = { itemId: second, condition: "DAMAGED", note: "Port retak", rackId, rackPosition: "B3" };
    const giveBack = async (key: string, input: ReturnType<typeof values>, today = realToday) => returnDemoLoan(testDb, await actor(key), loanId, input, today);

    await expect(giveBack("andi", values([good, damaged]))).rejects.toThrow("Hanya Operational & Admin");
    await expect(giveBack("devi", values([good, damaged], { returnedAt: addDaysIso(realToday, 1) }))).rejects.toThrow("masa depan");
    await expect(giveBack("devi", values([good, damaged], { returnedAt: addDaysIso(realToday, -1) }))).rejects.toThrow("sebelum tanggal diantar");
    await expect(giveBack("devi", values([good]))).rejects.toThrow("Semua unit di peminjaman ini wajib dicek");
    await expect(giveBack("devi", values([good, good]))).rejects.toThrow("Semua unit di peminjaman ini wajib dicek");
    // Posisi di luar rak → pesan menempel ke baris unit yang salah.
    await expect(giveBack("devi", values([good, { ...damaged, rackPosition: "Z9" }]))).rejects.toMatchObject({ message: "Posisi tidak ada di Rak 1", field: "items.1.rackPosition" });
    expect((await loanRow(loanId)).status).toBe("ON_LOAN"); // semua percobaan gagal tidak mengubah apa pun

    await giveBack("devi", values([good, damaged]));
    const detail = await getDemoLoanDetail(testDb, loanId, realToday);
    expect(detail).toMatchObject({
      status: "RETURNED",
      returnedAt: realToday,
      returnedByName: "Bapak Surahman",
      returnReceiverName: "Devi",
      returnNote: "Kardus lengkap",
      hafNumber: `001/AMI-HAF//${realToday.slice(0, 4)}`,
    });
    expect(detail?.items.find((item) => item.id === second)).toMatchObject({ returnCondition: "DAMAGED", returnNote: "Port retak", returnLocation: "Rak 1 · B3", location: "Rak 1 · A1" });

    // Unit pindah ke posisi baru (tercatat sebagai perubahan Lokasi oleh Devi), tidak tertahan lagi, kondisi terakhir terbawa.
    const [moved] = await listAssets(testDb, units.MUJ203Z);
    expect(moved).toMatchObject({ rackPosition: "B3", activeLoan: null, lastReturn: { condition: "DAMAGED", note: "Port retak", returnedAt: realToday } });
    expect((await listAssets(testDb, units.MUE00YP))[0]).toMatchObject({ rackPosition: "A1", activeLoan: null, lastReturn: { condition: "GOOD" } });
    const history = await assetHistory(testDb, units.MUJ203Z);
    expect(history.find((event) => event.title === "Dikembalikan dari peminjam")).toMatchObject({
      actor: "Devi",
      note: `Kondisi Rusak — Port retak · HAF 001/AMI-HAF//${realToday.slice(0, 4)} · PT Bank Danamon Indonesia · ${number}`,
    });
    expect(history.find((event) => event.kind === "updated")).toMatchObject({ actor: "Devi", changes: [{ label: "Lokasi", before: "Rak 1 · A1", after: "Rak 1 · B3" }] });
    expect((await assetHistory(testDb, units.MUE00YP)).some((event) => event.kind === "updated")).toBe(false); // posisi sama → tanpa perubahan

    const options = await getLoanFormOptions(testDb);
    expect(options.units.find((unit) => unit.id === units.MUJ203Z)).toMatchObject({ unavailable: null, lastReturn: { condition: "DAMAGED" } });
    await expect(giveBack("devi", values([good, damaged]))).rejects.toThrow("Hanya peminjaman yang sedang dipinjam");
    expect((await submit("sinta", { assetIds: [units.MUJ203Z] })).status).toBe("PENDING"); // bisa dipinjamkan lagi
  });

  it("unit boleh tidak ditaruh di rak; nomor HAF berurutan & bisa dilanjutkan dari nomor manual di Setting", async () => {
    const year = Number(realToday.slice(0, 4));
    const at = new Date(`${realToday}T03:00:00Z`);
    expect(await getFormCounter(testDb, "HAF", at)).toEqual({ year, lastValue: 0, nextNumber: `001/AMI-HAF//${year}` });
    await setFormCounter(testDb, u.ika, "HAF", { lastNumber: 14 }, at);

    const { loanId, first, second } = await deliveredLoan();
    await returnDemoLoan(
      testDb,
      await actor("ika"),
      loanId,
      values([
        { itemId: first, condition: "INCOMPLETE", note: "Tanpa kabel", rackId: "", rackPosition: "" },
        { itemId: second, condition: "GOOD", note: "", rackId, rackPosition: "A1" },
      ]),
      realToday,
    );
    expect((await loanRow(loanId)).hafNumber).toBe(`015/AMI-HAF//${year}`);
    expect((await listAssets(testDb, units.MUE00YP))[0]).toMatchObject({ rackId: null, rackPosition: null, lastReturn: { condition: "INCOMPLETE" } });
    await expect(setFormCounter(testDb, u.ika, "HAF", { lastNumber: 3 }, at)).rejects.toThrow("Nomor sampai 015 sudah terpakai");
    expect((await getFormCounter(testDb, "HAF", at)).nextNumber).toBe(`016/AMI-HAF//${year}`);
    expect((await getFormCounter(testDb, "PTF", at)).lastValue).toBe(1); // counter PTF terpisah
  });
});

describe("riwayat unit", () => {
  it("mencatat pendaftaran, setiap perubahan (siapa, apa), pengajuan pinjam, keputusan approval, dan revisi yang mengeluarkan unit", async () => {
    await updateAsset(testDb, u.devi, units.MUE00YP, assetSchema.parse({ deviceName: "SFP+ 10G SR", serialNo: "MUE00YP", category: "DEMO_UNIT", rackId, rackPosition: "C3", notes: "Kabel lengkap" }));
    const { loanId, number } = await submit("sinta");
    await rejectByYosep(loanId, "Pilih unit lain");
    await reviseDemoLoan(testDb, await actor("sinta"), loanId, input({ assetIds: [units.MUJ203Z] }), TODAY);
    await approveByYosep(loanId);

    const removed = await assetHistory(testDb, units.MUE00YP);
    expect(removed.map((event) => event.title)).toEqual([
      "Dikeluarkan dari pengajuan pinjam",
      "Pengajuan pinjam ditolak (level 1)",
      "Diajukan pinjam",
      "Data unit diubah",
      "Unit didaftarkan",
    ]);
    const edit = removed.find((event) => event.kind === "updated")!;
    expect(edit.actor).toBe("Devi");
    expect(edit.changes).toEqual([
      { label: "Part number / deskripsi", before: "SFP+ (10G)", after: "SFP+ 10G SR" },
      { label: "Catatan", before: "—", after: "Kabel lengkap" },
      { label: "Lokasi", before: "Rak 1 · A1", after: "Rak 1 · C3" },
    ]);
    expect(removed.find((event) => event.title === "Diajukan pinjam")).toMatchObject({ actor: "Sinta Lestari", note: `Backup Unit · PT Bank Danamon Indonesia · ${number}`, href: `/inventory/peminjaman/${loanId}` });
    expect(removed.find((event) => event.kind === "rejected")).toMatchObject({ actor: "Yosep", note: `${number} · Pilih unit lain` });

    const kept = await assetHistory(testDb, units.MUJ203Z);
    expect(kept.map((event) => event.title)).toEqual(["Pengajuan pinjam disetujui (level 1)", "Diajukan ulang", "Pengajuan pinjam ditolak (level 1)", "Diajukan pinjam", "Unit didaftarkan"]);
  });
});

describe("nomor form (Setting)", () => {
  it("melanjutkan nomor manual; tidak boleh di bawah nomor yang sudah terpakai", async () => {
    expect(await getTrialFormCounter(testDb, NOW)).toEqual({ year: 2026, lastValue: 0, nextNumber: "001/AMI-PTF/XI/2026" });
    await setTrialFormCounter(testDb, u.ika, { lastNumber: 8 }, NOW);
    expect((await getTrialFormCounter(testDb, NOW)).nextNumber).toBe("009/AMI-PTF/XI/2026");
    expect((await submit("sinta")).number).toBe("009/AMI-PTF/XI/2026");

    await expect(setTrialFormCounter(testDb, u.ika, { lastNumber: 5 }, NOW)).rejects.toThrow("Nomor sampai 009 sudah terpakai");
    await setTrialFormCounter(testDb, u.ika, { lastNumber: 20 }, NOW);
    expect((await getTrialFormCounter(testDb, NOW)).lastValue).toBe(20);
    expect(await testDb.auditLog.count({ where: { entity: "NumberSequence", entityId: "PTF/2026" } })).toBe(2);
  });
});

describe("email", () => {
  it("email approval ke Ko Yosep berisi rincian peminjaman; Operational belum diatur → email siap-disiapkan ke Admin", async () => {
    const { loanId } = await submit("sinta");
    const request = await requestOf(loanId);
    const [toYosep] = await buildApprovalEmails(testDb, { template: "approval-requested", recipientIds: [u.yosep], requestId: request.id });
    expect(toYosep.subject).toContain("[Approval] Peminjaman Unit 001/AMI-PTF/XI/2026 dari Sinta Lestari");
    const details = (toYosep.props as ApprovalEmailProps).details;
    expect(details).toContain("Kegunaan: Backup Unit (pengganti sementara unit customer yang bermasalah)");
    expect(details).toContain("SFP+ (10G) ×2 — SN MUE00YP, MUJ203Z");

    await approveByYosep(loanId);
    const toAdmins = (await buildDemoLoanEmails(testDb, loanId, "loan-approved")).map((email) => email.to).sort();
    const admins = (await testDb.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })).map((user) => user.email).sort();
    expect(toAdmins).toEqual(admins);

    const [row] = await listDemoLoans(testDb, TODAY);
    expect(row).toMatchObject({ number: "001/AMI-PTF/XI/2026", purpose: "BACKUP_UNIT", itemSummary: "SFP+ (10G) ×2", status: "APPROVED", overdue: false });
  });
});
