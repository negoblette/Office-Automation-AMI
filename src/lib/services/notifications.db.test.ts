import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { approveRequest, buildApproval, rejectRequest, restartApproval } from "@/lib/services/approval";
import { deleteCertificate } from "@/lib/services/certificate";
import { DISMISSAL_RETENTION_DAYS, dismissNotification, getNotifications, restoreNotification } from "@/lib/services/notifications";
import { NOTIFICATION_KEY } from "@/lib/validators/notification";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const TODAY = "2026-10-13";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};

describe("lonceng notifikasi (2026-10-13)", () => {
  it("staf: dokumen akan habis + pengajuan ditolak; approver: antrian; Admin: dokumen semua karyawan", async () => {
    const andi = await actor("andi");
    await testDb.document.create({
      data: {
        ownerType: "EMPLOYEE",
        employeeId: andi.employeeId!,
        docType: "SIM",
        fileKey: `${randomUUID()}.pdf`,
        fileName: "sim.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        validUntil: d("2026-10-20"),
        uploadedById: andi.id,
      },
    });
    const entityId = await createApprovalEntity("REIMBURSE", u.andi);
    const { requestId } = await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/10/0009", requesterId: u.andi }));

    // Ko Yosep (Approver L1) melihat antrian.
    expect((await getNotifications(testDb, await actor("yosep"), TODAY)).map((n) => n.title)).toEqual(["1 pengajuan menunggu persetujuan Anda"]);

    await rejectRequest(testDb, { requestId, actorId: u.yosep, reason: "Kurang lengkap" });
    const mine = await getNotifications(testDb, andi, TODAY);
    expect(mine.map((n) => [n.kind, n.title, n.tone])).toEqual([
      ["rejected", "Reimburse RMB/2026/10/0009 ditolak", "danger"],
      ["expiry", "SIM A/C berakhir 7 hari lagi", "danger"],
    ]);
    // Admin melihat dokumen semua karyawan; Sinta tidak melihat milik Andi.
    expect((await getNotifications(testDb, await actor("ika"), TODAY)).some((n) => n.kind === "expiry" && n.detail.includes("Andi Pratama"))).toBe(true);
    expect(await getNotifications(testDb, await actor("sinta"), TODAY)).toEqual([]);

    // Sertifikat yang dihapus pemohon (verifikasi dibatalkan) bukan notifikasi "ditolak".
    const certId = await createApprovalEntity("CERTIFICATE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "CERTIFICATE", entityId: certId, entityNumber: "CRT/2026/10/0009", requesterId: u.andi }));
    await deleteCertificate(testDb, andi, certId);
    expect((await getNotifications(testDb, andi, TODAY)).filter((n) => n.kind === "rejected")).toHaveLength(1);
  });
});

describe("notifikasi dibuka / dihapus (2026-11-16)", () => {
  const newSim = async (employeeId: string, uploadedById: string, validUntil: string) =>
    testDb.document.create({
      data: {
        ownerType: "EMPLOYEE",
        employeeId,
        docType: "SIM",
        fileKey: `${randomUUID()}.pdf`,
        fileName: "sim.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        validUntil: d(validUntil),
        uploadedById,
      },
    });
  const submitReimburse = async (requester: string, number: string) => {
    const entityId = await createApprovalEntity("REIMBURSE", requester);
    const { requestId } = await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: number, requesterId: requester }));
    return { entityId, requestId };
  };

  it("kunci setiap notifikasi lolos validasi aksi lonceng", async () => {
    const andi = await actor("andi");
    await newSim(andi.employeeId!, andi.id, "2026-10-20");
    const { requestId } = await submitReimburse(u.andi, "RMB/2026/10/0011");
    const queue = await getNotifications(testDb, await actor("yosep"), TODAY);
    await rejectRequest(testDb, { requestId, actorId: u.yosep, reason: "Kurang lengkap" });
    const all = [...queue, ...(await getNotifications(testDb, andi, TODAY)), ...(await getNotifications(testDb, await actor("ika"), TODAY))];
    expect(new Set(all.map((n) => n.kind))).toEqual(new Set(["approval", "rejected", "expiry"]));
    for (const n of all) expect(n.key).toMatch(NOTIFICATION_KEY);
  });

  it("ditolak: hilang setelah dibuka, muncul lagi bila ditolak lagi setelah diajukan ulang; Urungkan mengembalikan", async () => {
    const andi = await actor("andi");
    const { entityId, requestId } = await submitReimburse(u.andi, "RMB/2026/10/0012");
    await rejectRequest(testDb, { requestId, actorId: u.yosep, reason: "Kurang lengkap" });
    const [rejected] = await getNotifications(testDb, andi, TODAY);
    expect(rejected.kind).toBe("rejected");

    expect(await dismissNotification(testDb, andi, { key: rejected.key }, TODAY)).toBe(true);
    expect(await getNotifications(testDb, andi, TODAY)).toEqual([]);
    // Urungkan.
    await restoreNotification(testDb, andi.id, rejected.key);
    expect((await getNotifications(testDb, andi, TODAY)).map((n) => n.key)).toEqual([rejected.key]);

    // Dihapus lagi, lalu direvisi → diajukan ulang → ditolak lagi = notifikasi baru.
    await dismissNotification(testDb, andi, { key: rejected.key }, TODAY);
    const again = await testDb.$transaction((tx) => restartApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/10/0012", requesterId: u.andi }));
    await rejectRequest(testDb, { requestId: again.requestId, actorId: u.yosep, reason: "Masih kurang" });
    const now = await getNotifications(testDb, andi, TODAY);
    expect(now).toHaveLength(1);
    expect(now[0].key).not.toBe(rejected.key);
    expect(now[0].title).toBe("Reimburse RMB/2026/10/0012 ditolak");
  });

  it("antrian approval: tetap tersembunyi saat berkurang, muncul lagi saat ada pengajuan baru", async () => {
    const yosep = await actor("yosep");
    const first = await submitReimburse(u.andi, "RMB/2026/10/0013");
    const second = await submitReimburse(u.andi, "RMB/2026/10/0014");
    const [queue] = await getNotifications(testDb, yosep, TODAY);
    expect(queue.title).toBe("2 pengajuan menunggu persetujuan Anda");
    await dismissNotification(testDb, yosep, { key: queue.key, seen: queue.seen }, TODAY);
    expect(await getNotifications(testDb, yosep, TODAY)).toEqual([]);

    // Satu disetujui (lanjut ke L2 Ko Rudy) → antrian Yosep berkurang, tidak ada yang baru → tetap tersembunyi.
    await approveRequest(testDb, { requestId: first.requestId, actorId: u.yosep });
    expect(await getNotifications(testDb, yosep, TODAY)).toEqual([]);
    // Ko Rudy belum pernah menghapus → melihat antriannya.
    expect((await getNotifications(testDb, await actor("rudy"), TODAY)).map((n) => n.title)).toContain("1 pengajuan menunggu persetujuan Anda");

    // Pengajuan baru masuk → tampil lagi dengan jumlah terkini.
    await submitReimburse(u.andi, "RMB/2026/10/0015");
    expect((await getNotifications(testDb, yosep, TODAY)).map((n) => n.title)).toEqual(["2 pengajuan menunggu persetujuan Anda"]);
    expect(second.requestId).toBeTruthy();
  });

  it("antrian approval: pengajuan yang masuk setelah lonceng dibuka tidak ikut tersembunyi", async () => {
    const yosep = await actor("yosep");
    await submitReimburse(u.andi, "RMB/2026/10/0016");
    const [queue] = await getNotifications(testDb, yosep, TODAY);
    // Sebelum Yosep menekan ×, pengajuan lain masuk — dia belum melihatnya.
    await submitReimburse(u.andi, "RMB/2026/10/0017");
    await dismissNotification(testDb, yosep, { key: queue.key, seen: queue.seen }, TODAY);
    expect((await getNotifications(testDb, yosep, TODAY)).map((n) => n.title)).toEqual(["2 pengajuan menunggu persetujuan Anda"]);
    // `seen` palsu (id yang tidak menunggu dia) tidak ikut dicatat.
    const [latest] = await getNotifications(testDb, yosep, TODAY);
    await dismissNotification(testDb, yosep, { key: latest.key, seen: [...latest.seen!, "bukan-id-pengajuan"] }, TODAY);
    const row = await testDb.notificationDismissal.findUniqueOrThrow({ where: { userId_key: { userId: u.yosep, key: "approval" } } });
    expect([...row.context].sort()).toEqual([...latest.seen!].sort());
  });

  it("dokumen: muncul lagi saat naik tahap (30 hari → ≤ 7 hari → kadaluarsa) dan saat diperpanjang", async () => {
    const andi = await actor("andi");
    const doc = await newSim(andi.employeeId!, andi.id, "2026-11-01"); // TODAY + 19 hari
    const [soon] = await getNotifications(testDb, andi, TODAY);
    expect(soon.key).toMatch(/:month$/);
    await dismissNotification(testDb, andi, { key: soon.key }, TODAY);
    expect(await getNotifications(testDb, andi, TODAY)).toEqual([]);
    expect(await getNotifications(testDb, andi, "2026-10-20")).toEqual([]); // masih tahap 30 hari

    const week = await getNotifications(testDb, andi, "2026-10-26"); // 6 hari lagi
    expect(week.map((n) => n.title)).toEqual(["SIM A/C berakhir 6 hari lagi"]);
    await dismissNotification(testDb, andi, { key: week[0].key }, "2026-10-26");
    expect(await getNotifications(testDb, andi, "2026-10-30")).toEqual([]);
    expect((await getNotifications(testDb, andi, "2026-11-02")).map((n) => n.title)).toEqual(["SIM A/C sudah kadaluarsa"]);

    // Diperpanjang (tanggal berakhir baru) → notifikasi berikutnya bukan yang sudah dihapus.
    await testDb.document.update({ where: { id: doc.id }, data: { validUntil: d("2026-11-10") } });
    expect((await getNotifications(testDb, andi, TODAY)).map((n) => n.title)).toEqual(["SIM A/C berakhir 28 hari lagi"]);
  });

  it("aman: notifikasi yang sudah tidak berlaku, klik ganda, dan milik user lain", async () => {
    const andi = await actor("andi");
    const ika = await actor("ika");
    await newSim(andi.employeeId!, andi.id, "2026-10-20");
    const [mine] = await getNotifications(testDb, andi, TODAY);

    // Sudah tidak berlaku / kunci asing → tidak dicatat, bukan error.
    expect(await dismissNotification(testDb, andi, { key: "rejected:tidak-ada:1" }, TODAY)).toBe(false);
    expect(await testDb.notificationDismissal.count()).toBe(0);

    // Klik ganda bersamaan → satu baris, tanpa error.
    await Promise.all([dismissNotification(testDb, andi, { key: mine.key }, TODAY), dismissNotification(testDb, andi, { key: mine.key }, TODAY)]);
    expect(await testDb.notificationDismissal.count({ where: { userId: u.andi } })).toBe(1);

    // Admin melihat dokumen yang sama dengan kunci yang sama — tetap tampil untuknya.
    expect((await getNotifications(testDb, ika, TODAY)).some((n) => n.key === mine.key)).toBe(true);
  });

  it(`catatan lebih dari ${DISMISSAL_RETENTION_DAYS} hari diabaikan lalu dibersihkan`, async () => {
    const andi = await actor("andi");
    await newSim(andi.employeeId!, andi.id, "2026-10-20");
    const [mine] = await getNotifications(testDb, andi, TODAY);
    await dismissNotification(testDb, andi, { key: mine.key }, TODAY);
    const old = new Date(Date.now() - (DISMISSAL_RETENTION_DAYS + 1) * 86_400_000);
    await testDb.notificationDismissal.updateMany({ where: { userId: u.andi }, data: { dismissedAt: old } });
    expect((await getNotifications(testDb, andi, TODAY)).map((n) => n.key)).toEqual([mine.key]);

    // Menghapus notifikasi lain membersihkan catatan lama milik user itu.
    await newSim(andi.employeeId!, andi.id, "2026-10-25");
    const other = (await getNotifications(testDb, andi, TODAY)).find((n) => n.key !== mine.key)!;
    await dismissNotification(testDb, andi, { key: other.key }, TODAY);
    expect((await testDb.notificationDismissal.findMany({ where: { userId: u.andi } })).map((r) => r.key)).toEqual([other.key]);
  });
});
