// Sinkronisasi Kalender Libur dari kalender Google (2026-11-18): impor awal, perubahan dicek ulang lalu diterapkan,
// pengajuan cuti terdampak → HR & Direktur, rem perubahan massal. Sumber diganti daftar tiruan (tanpa internet).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { fromIsoDate } from "@/lib/format";
import { type ExternalHoliday, HolidaySourceError } from "@/lib/holidays/google-calendar";
import { buildHolidayChangeEmails } from "@/lib/mail/holiday-emails";
import { getHolidaySyncStatus, listHolidayRuns, saveHolidayNotifyUsers, syncHolidays } from "@/lib/services/holiday-sync";
import { getNotifications } from "@/lib/services/notifications";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
  await testDb.holiday.deleteMany();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
});

afterAll(async () => {
  await testDb.$disconnect();
});

const TODAY = "2026-11-18";
const DAY0 = new Date("2026-11-17T23:00:00Z"); // 06:00 WIB
const later = (hours: number) => new Date(DAY0.getTime() + hours * 3_600_000);
const H = (date: string, name: string, kind: ExternalHoliday["kind"] = "NATIONAL"): ExternalHoliday => ({ date, name, kind, tentative: name.includes("belum pasti") });
const BASE = [
  H("2026-08-17", "Proklamasi 2026"), // sudah lewat
  H("2026-12-25", "Hari Raya Natal"),
  H("2027-01-01", "Hari Tahun Baru"),
  H("2027-03-09", "Cuti Bersama Idul Fitri", "CUTI_BERSAMA"),
  H("2027-03-10", "Hari Idul Fitri (belum pasti)"),
  H("2027-03-11", "Hari Idul Fitri (belum pasti)"),
  H("2027-08-17", "Hari Proklamasi"),
];
const run = (list: ExternalHoliday[], now = DAY0, actorId: string | null = null) => syncHolidays(testDb, { todayIso: TODAY, now, source: async () => list, actorId });
const active = async () =>
  (await testDb.holiday.findMany({ where: { deletedAt: null }, orderBy: { date: "asc" }, select: { date: true, name: true, source: true } })).map(
    (h) => `${h.date.toISOString().slice(0, 10)} ${h.source} ${h.name}`,
  );
const viewer = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId, isSuperAdmin: false };
};
const leave = (key: string, number: string, start: string, end: string, status: "PENDING" | "APPROVED" | "REJECTED") =>
  testDb.leaveRequest.create({
    data: { number, employeeId: emp[key], startDate: fromIsoDate(start), endDate: fromIsoDate(end), workingDays: 3, deductDays: 3, reason: "uji", status },
  });

describe("impor awal", () => {
  it("langsung ditambahkan; cuti bersama, tanggal lampau, libur Kantor, & yang dihapus Admin tidak disentuh", async () => {
    await testDb.holiday.create({ data: { date: fromIsoDate("2027-08-17"), name: "Libur kantor", isNational: false } });
    await testDb.holiday.create({ data: { date: fromIsoDate("2027-01-01"), name: "Dihapus Admin", deletedAt: new Date() } });
    await testDb.holiday.create({ data: { date: fromIsoDate("2027-05-05"), name: "Libur lama isian manual" } });

    const result = await run(BASE, DAY0, u.ika);
    expect(result.error).toBeNull();
    expect(result.applied.map((c) => `${c.kind} ${c.date}`)).toEqual(["ADD 2026-12-25", "ADD 2027-03-10", "ADD 2027-03-11"]);
    expect(result.pending).toEqual([]);
    expect(result.unmanaged).toEqual([{ date: "2027-05-05", name: "Libur lama isian manual" }]);
    expect(result.years).toEqual([
      { year: 2026, available: true, holidays: 2 },
      { year: 2027, available: true, holidays: 4 },
    ]);
    expect(await active()).toEqual([
      "2026-12-25 SYNC Hari Raya Natal",
      "2027-03-10 SYNC Hari Idul Fitri (belum pasti)",
      "2027-03-11 SYNC Hari Idul Fitri (belum pasti)",
      "2027-05-05 MANUAL Libur lama isian manual",
      "2027-08-17 MANUAL Libur kantor",
    ]);
    expect((await testDb.auditLog.findMany({ where: { entity: "Holiday", action: "CREATE" } })).map((a) => a.userId)).toEqual([u.ika, u.ika, u.ika]);

    // Belum ada penerima diatur → semua Admin aktif.
    const admins = await testDb.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } });
    const emails = await buildHolidayChangeEmails(testDb, result.runId!);
    expect(emails.map((e) => e.to).sort()).toEqual(admins.map((a) => a.email).sort());
    expect(emails[0].subject).toBe("[Kalender Libur] 3 perubahan libur nasional");

    // Dijalankan lagi → tidak ada yang dobel.
    expect((await run(BASE, later(1))).applied).toEqual([]);
  });
});

describe("perubahan dicek ulang, lalu diterapkan", () => {
  it("libur dipindah: menunggu konfirmasi di hari yang sama, diterapkan keesokan hari; cuti terdampak → Ci Ika & Ko Rudy", async () => {
    await run(BASE);
    await saveHolidayNotifyUsers(testDb, u.ika, { userIds: [u.ika, u.rudy] });
    const andi = await leave("andi", "LV/2027/03/0001", "2027-03-08", "2027-03-12", "APPROVED");
    const sinta = await leave("sinta", "LV/2027/03/0002", "2027-03-12", "2027-03-12", "PENDING");
    await leave("andi", "LV/2027/03/0003", "2027-03-10", "2027-03-10", "REJECTED");

    // SKB final: Idul Fitri hari pertama pindah 10 → 12 Mar; hari kedua tetap tapi "(belum pasti)" hilang.
    const moved = [...BASE.filter((h) => h.date !== "2027-03-10" && h.date !== "2027-03-11"), H("2027-03-11", "Hari Idul Fitri"), H("2027-03-12", "Hari Idul Fitri (hari kedua)")];

    const sameDay = await run(moved, later(2));
    expect(sameDay.applied).toEqual([]);
    expect(sameDay.pending.map((c) => `${c.kind} ${c.date}`)).toEqual(["REMOVE 2027-03-10", "RENAME 2027-03-11", "ADD 2027-03-12"]);
    expect(await active()).toContain("2027-03-10 SYNC Hari Idul Fitri (belum pasti)");

    const nextDay = await run(moved, later(24));
    expect(new Set(nextDay.applied.map((c) => `${c.kind} ${c.date}`))).toEqual(new Set(["REMOVE 2027-03-10", "RENAME 2027-03-11", "ADD 2027-03-12"]));
    expect(nextDay.pending).toEqual([]);
    expect(await active()).toEqual([
      "2026-12-25 SYNC Hari Raya Natal",
      "2027-01-01 SYNC Hari Tahun Baru",
      "2027-03-11 SYNC Hari Idul Fitri",
      "2027-03-12 SYNC Hari Idul Fitri (hari kedua)",
      "2027-08-17 SYNC Hari Proklamasi",
    ]);
    const removed = await testDb.holiday.findUniqueOrThrow({ where: { date: fromIsoDate("2027-03-10") } });
    expect(removed).toMatchObject({ removedBySync: true, source: "SYNC" });
    expect(removed.deletedAt).not.toBeNull();

    // Cuti terdampak: 12 Mar jadi libur (Andi & Sinta), 10 Mar batal libur (Andi); yang ditolak tidak ikut.
    const [latest] = await listHolidayRuns(testDb);
    const affectedOf = (date: string) => latest.changes.find((c) => c.date === date)!.affected.map((l) => l.id).sort();
    expect(affectedOf("2027-03-12")).toEqual([andi.id, sinta.id].sort());
    expect(affectedOf("2027-03-10")).toEqual([andi.id]);
    expect(affectedOf("2027-03-11")).toEqual([]);
    expect(latest.changes.find((c) => c.date === "2027-03-12")!.affected[0].effect).toContain("saldo mungkin terpotong 1 hari terlalu banyak");

    const emails = await buildHolidayChangeEmails(testDb, nextDay.runId!);
    const emailOf = async (key: string) => (await testDb.user.findUniqueOrThrow({ where: { id: u[key] } })).email;
    expect(emails.map((e) => e.to).sort()).toEqual([await emailOf("ika"), await emailOf("rudy")].sort());
    expect(emails[0].subject).toBe("[Kalender Libur] 3 perubahan libur nasional · 2 pengajuan cuti terdampak");
    expect(emails[0].props.affected.join("\n")).toContain("LV/2027/03/0001 · Andi Pratama");

    // Lonceng: hanya penerima (Ci Ika & Ko Rudy), bukan Admin lain.
    const bell = async (key: string) => (await getNotifications(testDb, await viewer(key))).filter((item) => item.kind === "holiday");
    expect(await bell("ika")).toEqual(expect.arrayContaining([expect.objectContaining({ detail: "2 pengajuan cuti terdampak — cek saldo", tone: "warning" })]));
    expect(await bell("rudy")).not.toEqual([]);
    expect(await bell("leonard")).toEqual([]);
  });

  it("perubahan yang kembali seperti semula sebelum dikonfirmasi → dibatalkan; libur yang dihapus sinkronisasi bisa dipulihkan", async () => {
    await run(BASE);
    const moved = BASE.map((h) => (h.date === "2027-03-11" ? H("2027-03-12", h.name) : h));
    expect((await run(moved, later(1))).pending).toHaveLength(2);
    const reverted = await run(BASE, later(24));
    expect(reverted.applied).toEqual([]);
    expect(reverted.pending).toEqual([]);
    expect(await testDb.holidayPendingChange.count()).toBe(0);

    // Benar-benar dipindah (dikonfirmasi), lalu sumber mengembalikannya → dipulihkan setelah dikonfirmasi lagi.
    await run(moved, later(25));
    await run(moved, later(50));
    expect(await testDb.holiday.findUniqueOrThrow({ where: { date: fromIsoDate("2027-03-11") } })).toMatchObject({ removedBySync: true });
    await run(BASE, later(51));
    const back = await run(BASE, later(76));
    expect(new Set(back.applied.map((c) => `${c.kind} ${c.date}`))).toEqual(new Set(["ADD 2027-03-11", "REMOVE 2027-03-12"]));
    expect(await testDb.holiday.findUniqueOrThrow({ where: { date: fromIsoDate("2027-03-11") } })).toMatchObject({ deletedAt: null, removedBySync: false });
  });
});

describe("pengaman", () => {
  it("rem: terlalu banyak perubahan sekaligus → ditahan & diberitahukan, tidak ada yang berubah", async () => {
    const many = Array.from({ length: 8 }, (_, i) => H(`2027-0${(i % 8) + 1}-15`, `Libur ${i + 1}`));
    await run(many);
    expect(await testDb.holiday.count({ where: { deletedAt: null } })).toBe(8);
    // Sumber tiba-tiba kosong (salah / format berubah) → 8 penghapusan.
    await run([], later(1));
    const blocked = await run([], later(24));
    expect(blocked.blocked).toBe(true);
    expect(blocked.applied).toEqual([]);
    expect(blocked.pending).toHaveLength(8);
    expect(await testDb.holiday.count({ where: { deletedAt: null } })).toBe(8);
    expect((await getHolidaySyncStatus(testDb))?.blocked).toBe(true);
    const bell = (await getNotifications(testDb, await viewer("ika"))).filter((item) => item.key.startsWith("holidaysync:blocked:"));
    expect(bell).toEqual([expect.objectContaining({ tone: "danger", title: "Sinkronisasi libur ditahan" })]);
  });

  it("sumber bermasalah → pesan tersimpan, tidak ada yang berubah; libur yang diisi Admin = MANUAL", async () => {
    await run(BASE);
    const failed = await syncHolidays(testDb, {
      todayIso: TODAY,
      now: later(24),
      source: async () => {
        throw new HolidaySourceError("Kalender Google tidak bisa dihubungi (jaringan / timeout)");
      },
    });
    expect(failed).toMatchObject({ error: "Kalender Google tidak bisa dihubungi (jaringan / timeout)", applied: [], runId: null });
    expect(await testDb.holiday.count({ where: { deletedAt: null } })).toBe(5);

    // Status format lama (versi apipedia) / rusak tidak membuat kartu error.
    await testDb.appSetting.update({ where: { key: "holiday.sync.last" }, data: { value: { at: "2026-11-18T09:04:17.929Z", error: null, years: [{ year: 2027, added: [], available: false }] } } });
    expect(await getHolidaySyncStatus(testDb)).toMatchObject({ pending: [], unmanaged: [], applied: [], blocked: false, years: [{ year: 2027, available: false, holidays: 0 }] });
    await testDb.appSetting.update({ where: { key: "holiday.sync.last" }, data: { value: "rusak" } });
    expect(await getHolidaySyncStatus(testDb)).toBeNull();

    await expect(saveHolidayNotifyUsers(testDb, u.ika, { userIds: ["tidak-ada"] })).rejects.toThrow("tidak ditemukan");
    await testDb.user.update({ where: { id: u.rudy }, data: { isActive: false } });
    await expect(saveHolidayNotifyUsers(testDb, u.ika, { userIds: [u.rudy] })).rejects.toThrow("Hanya user aktif");
  });
});
