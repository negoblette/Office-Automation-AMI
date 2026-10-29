// Worker pg-boss (`npm run worker`) — Tech Spec §7. Proses terpisah dari aplikasi web.
// Job: `email.send` (on-demand), `leave.rollover` (harian 00:30 WIB),
// `reminder.certificate`, `reminder.document` & `reminder.asset` (harian 07:00 WIB, H-30), `attendance.deduct` (harian 01:00 WIB),
// `storage.orphan-purge` (harian 03:00 WIB, hardening Tahap 7).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PgBoss } from "pg-boss";
import { PrismaClient } from "@/generated/prisma/client";
import { EMAIL_QUEUE, EMAIL_QUEUE_OPTIONS, type EmailJobData, enqueueEmails } from "@/lib/mail/queue";
import { createSmtpTransport, processEmailJob } from "@/lib/mail/send-email";
import { rolloverLeaveBalances } from "@/lib/services/leave-balance";
import { FEATURES } from "@/lib/features";
import { deductUnexcusedAbsences } from "@/lib/services/attendance-appeal";
import { purgeOrphanFiles } from "@/lib/services/upload";
// Adapter langsung (bukan "@/lib/storage" yang ber-"server-only" & tidak bisa dimuat di Node biasa).
import { LocalStorage } from "@/lib/storage/local";
import { assetReminders, certificateReminders, documentReminders } from "@/lib/services/reminder";

const LEAVE_ROLLOVER_QUEUE = "leave.rollover";
const REMINDER_JOBS: Record<string, typeof certificateReminders> = {
  "reminder.certificate": certificateReminders,
  "reminder.document": documentReminders,
  ...(FEATURES.inventory ? { "reminder.asset": assetReminders } : {}),
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
      console.log(`[worker] email terkirim → ${job.data.to}: ${job.data.subject}`);
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
  if (!FEATURES.inventory) await boss.unschedule("reminder.asset").catch(() => undefined);

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

  console.log(
    `[worker] siap. Queue: ${EMAIL_QUEUE}, ${LEAVE_ROLLOVER_QUEUE} (00:30 WIB), ${Object.keys(REMINDER_JOBS).join(", ")} (07:00 WIB), ${ATTENDANCE_DEDUCT_QUEUE} (01:00 WIB), ${ORPHAN_PURGE_QUEUE} (03:00 WIB)`,
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
