// Worker pg-boss (`npm run worker`) — Tech Spec §7. Proses terpisah dari aplikasi web.
// Job: `email.send` (on-demand), `leave.rollover` (harian 00:30 WIB),
// `reminder.certificate`, `reminder.document` & `reminder.asset` (harian 07:00 WIB, H-30), `reminder.demo-loan` (harian
// 07:00 WIB, jatuh tempo peminjaman unit — Tahap 16.4 — & tindak lanjut unit rusak / tidak lengkap — 2026-11-20),
// `attendance.deduct` (harian 01:00 WIB),
// `storage.orphan-purge` (harian 03:00 WIB, hardening Tahap 7), `attendance.auto-clock-out` (tiap 5 menit, 2026-10-30),
// `holiday.sync` (harian 06:00 WIB + tombol Admin, libur nasional dari kalender publik Google — 2026-11-18; mode browser
// 2026-11-27: hanya tombol Admin, data dari browser — lib/holidays/mode.ts).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PgBoss } from "pg-boss";
import { PrismaClient } from "@/generated/prisma/client";
import { EMAIL_QUEUE, EMAIL_QUEUE_OPTIONS, type EmailJobData, enqueueEmails, type OutgoingEmail } from "@/lib/mail/queue";
import { loanDueReminders, loanFollowUpReminders } from "@/lib/services/demo-loan-reminder";
import { safeSubject } from "@/lib/mail/headers";
import { createSmtpTransport, processEmailJob } from "@/lib/mail/send-email";
import { rolloverLeaveBalances } from "@/lib/services/leave-balance";
import { FEATURES } from "@/lib/features";
import { deductUnexcusedAbsences } from "@/lib/services/attendance-appeal";
import { autoClockOut } from "@/lib/services/attendance";
import { purgeOrphanFiles } from "@/lib/services/upload";
// Adapter langsung (bukan "@/lib/storage" yang ber-"server-only" & tidak bisa dimuat di Node biasa).
import { LocalStorage } from "@/lib/storage/local";
import { assetReminders, certificateReminders, documentReminders } from "@/lib/services/reminder";
import { HOLIDAY_SYNC_QUEUE, syncHolidays } from "@/lib/services/holiday-sync";
import { buildHolidayChangeEmails } from "@/lib/mail/holiday-emails";
import { holidaySyncMode } from "@/lib/holidays/mode";
import { externalHolidaysSchema } from "@/lib/validators/leave";

const LEAVE_ROLLOVER_QUEUE = "leave.rollover";
const REMINDER_JOBS: Record<string, (db: PrismaClient) => Promise<OutgoingEmail[]>> = {
  "reminder.certificate": certificateReminders,
  "reminder.document": documentReminders,
  // Tahap 16.4: jatuh tempo peminjaman unit (H-7, H-1, terlambat tiap 7 hari) → pemohon & Operational.
  // 2026-11-20: tindak lanjut unit rusak / tidak lengkap (tiap 7 hari selama belum selesai) → PIC & Operational.
  ...(FEATURES.inventory
    ? {
        "reminder.asset": assetReminders,
        "reminder.demo-loan": async (db: PrismaClient) => [...(await loanDueReminders(db)), ...(await loanFollowUpReminders(db))],
      }
    : {}),
};

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  // Hardening Tahap 4: skema pgboss disiapkan deploy/postgres/init-roles.sh (milik oa_app, yang sengaja tidak berhak
  // CREATE SCHEMA). Skema belum ada (database lama tanpa init-roles) → pg-boss membuatnya sendiri seperti sebelumnya.
  const [{ exists: pgbossSchemaExists }] = await db.$queryRaw<[{ exists: boolean }]>`SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss') AS "exists"`;
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, createSchema: !pgbossSchemaExists });
  boss.on("error", (error) => console.error("[worker] pg-boss error", error));
  await boss.start();

  await boss.createQueue(EMAIL_QUEUE, EMAIL_QUEUE_OPTIONS);
  const transport = createSmtpTransport();

  await boss.work<EmailJobData>(EMAIL_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await processEmailJob(db, transport, job.data);
      // Subjek bisa memuat isian user → dibersihkan supaya tidak memalsukan baris log (log injection).
      console.log(`[worker] email terkirim → ${job.data.to}: ${safeSubject(job.data.subject)}`);
    }
  });

  // Tech Spec §7: buat LeaveBalance periode baru setiap hari 00:30 WIB.
  await boss.createQueue(LEAVE_ROLLOVER_QUEUE);
  await boss.schedule(LEAVE_ROLLOVER_QUEUE, "30 0 * * *", null, { tz: "Asia/Jakarta" });
  await boss.work(LEAVE_ROLLOVER_QUEUE, async () => {
    const created = await rolloverLeaveBalances(db);
    console.log(`[worker] leave.rollover: ${created} saldo periode baru dibuat`);
  });

  // Fase 14: tidak hadir tanpa appeal > 7 hari → potong 1 hari cuti (harian 01:00 WIB).
  const ATTENDANCE_DEDUCT_QUEUE = "attendance.deduct";
  await boss.createQueue(ATTENDANCE_DEDUCT_QUEUE);
  await boss.schedule(ATTENDANCE_DEDUCT_QUEUE, "0 1 * * *", null, { tz: "Asia/Jakarta" });
  await boss.work(ATTENDANCE_DEDUCT_QUEUE, async () => {
    const result = await deductUnexcusedAbsences(db);
    console.log(`[worker] ${ATTENDANCE_DEDUCT_QUEUE}: ${result.deducted} hari tidak hadir dipotong dari saldo cuti`);
  });

  // 2026-10-30: yang belum clock out setelah lewat jam pulang diisi clock out otomatis = jam pulang. Tiap 5 menit
  // (bukan sekali di jam pulang) karena jam pulang bisa diubah Admin di Setting → Absensi.
  const AUTO_CLOCK_OUT_QUEUE = "attendance.auto-clock-out";
  await boss.createQueue(AUTO_CLOCK_OUT_QUEUE);
  await boss.schedule(AUTO_CLOCK_OUT_QUEUE, "*/5 * * * *", null, { tz: "Asia/Jakarta" });
  await boss.work(AUTO_CLOCK_OUT_QUEUE, async () => {
    const closed = await autoClockOut(db);
    if (closed) console.log(`[worker] ${AUTO_CLOCK_OUT_QUEUE}: ${closed} absen di-clock out otomatis`);
  });

  // Hardening Tahap 7: file yatim (ter-upload ≥ 24 jam tapi tidak dipakai data apa pun) dihapus (harian 03:00 WIB).
  const ORPHAN_PURGE_QUEUE = "storage.orphan-purge";
  await boss.createQueue(ORPHAN_PURGE_QUEUE);
  await boss.schedule(ORPHAN_PURGE_QUEUE, "0 3 * * *", null, { tz: "Asia/Jakarta" });
  await boss.work(ORPHAN_PURGE_QUEUE, async () => {
    const storage = new LocalStorage(process.env.UPLOAD_DIR ?? "./storage/uploads");
    const result = await purgeOrphanFiles(db, storage);
    console.log(`[worker] ${ORPHAN_PURGE_QUEUE}: ${result.orphans.length} file yatim dihapus dari ${result.scanned} file`);
  });

  // Modul Inventory ditunda → hapus jadwal reminder.asset yang mungkin tersimpan dari sebelumnya.
  if (!FEATURES.inventory) {
    await boss.unschedule("reminder.asset").catch(() => undefined);
    await boss.unschedule("reminder.demo-loan").catch(() => undefined);
  }

  // Tech Spec §7: reminder H-30 setiap hari 07:00 WIB (email tetap lewat antrian email.send).
  for (const [queue, collect] of Object.entries(REMINDER_JOBS)) {
    await boss.createQueue(queue);
    await boss.schedule(queue, "0 7 * * *", null, { tz: "Asia/Jakarta" });
    await boss.work(queue, async () => {
      const emails = await collect(db);
      await enqueueEmails(db, emails);
      console.log(`[worker] ${queue}: ${emails.length} email reminder di-enqueue`);
    });
  }

  // Libur nasional dari kalender publik Google + tombol "Sinkronkan sekarang" (Admin). Perubahan yang diterapkan → email
  // ke penerima notifikasi (HR & Direktur) beserta pengajuan cuti terdampak.
  // Mode server: worker mengunduh sendiri, setiap hari 06:00 WIB. Mode browser (2026-11-27, server tanpa internet): data
  // dikirim browser Admin lewat job; jadwal harian dihapus (jadwal lama tersimpan di database pg-boss).
  const holidayMode = holidaySyncMode();
  await boss.createQueue(HOLIDAY_SYNC_QUEUE);
  if (holidayMode === "server") await boss.schedule(HOLIDAY_SYNC_QUEUE, "0 6 * * *", null, { tz: "Asia/Jakarta" });
  else await boss.unschedule(HOLIDAY_SYNC_QUEUE).catch(() => undefined);
  await boss.work<{ requestedBy?: string; holidays?: unknown } | null>(HOLIDAY_SYNC_QUEUE, async ([job]) => {
    const fromBrowser = job?.data?.holidays;
    if (holidayMode === "browser" && fromBrowser === undefined) {
      // Job tanpa data (jadwal lama / tombol versi lama) — mode browser tidak boleh mengunduh sendiri.
      console.log(`[worker] ${HOLIDAY_SYNC_QUEUE}: dilewati — mode browser, data libur dikirim dari browser Admin`);
      return;
    }
    // Pelaku audit: Admin aktif yang menekan tombol; jadwal otomatis = sistem (null).
    const requestedBy = typeof job?.data?.requestedBy === "string" ? job.data.requestedBy : null;
    const admin = requestedBy
      ? await db.user.findFirst({ where: { id: requestedBy, role: "ADMIN", isActive: true }, select: { id: true } })
      : null;
    const result = await syncHolidays(db, {
      actorId: admin?.id ?? null,
      // Mode browser: data kiriman browser Admin (sudah divalidasi server action) dicek ulang sebelum dipakai; tidak sesuai
      // → sinkronisasi gagal tanpa perubahan (pesan di kartu Admin, detail di log worker).
      source: fromBrowser === undefined ? undefined : async () => externalHolidaysSchema.parse(fromBrowser),
    });
    // Perubahan sudah tersimpan: gagal menyusun email tidak mengulang sinkronisasi (lonceng & kartu tetap menampilkannya).
    if (result.runId) {
      await buildHolidayChangeEmails(db, result.runId)
        .then((emails) => enqueueEmails(db, emails))
        .catch((error) => console.error(`[worker] ${HOLIDAY_SYNC_QUEUE}: gagal menyusun email`, error));
    }
    console.log(
      `[worker] ${HOLIDAY_SYNC_QUEUE}: ${
        result.error ??
        `${result.applied.length} diterapkan, ${result.pending.length} menunggu konfirmasi${result.blocked ? ", DITAHAN (terlalu banyak perubahan)" : ""}`
      }`,
    );
  });

  console.log(
    `[worker] siap. Queue: ${EMAIL_QUEUE}, ${LEAVE_ROLLOVER_QUEUE} (00:30 WIB), ${Object.keys(REMINDER_JOBS).join(", ")} (07:00 WIB), ${ATTENDANCE_DEDUCT_QUEUE} (01:00 WIB), ${ORPHAN_PURGE_QUEUE} (03:00 WIB), ${AUTO_CLOCK_OUT_QUEUE} (tiap 5 menit), ${HOLIDAY_SYNC_QUEUE} (${holidayMode === "server" ? "06:00 WIB + tombol Admin" : "mode browser — tombol Admin"})`,
  );

  const shutdown = async () => {
    console.log("[worker] berhenti…");
    await boss.stop({ graceful: true });
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] gagal start", error);
  process.exit(1);
});
