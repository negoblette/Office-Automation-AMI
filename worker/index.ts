// Worker pg-boss (`npm run worker`) — Tech Spec §7. Proses terpisah dari aplikasi web.
// Job: `email.send` (on-demand), `leave.rollover` (harian 00:30 WIB),
// `reminder.certificate` & `reminder.asset` (harian 07:00 WIB, H-30).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PgBoss } from "pg-boss";
import { PrismaClient } from "@/generated/prisma/client";
import { EMAIL_QUEUE, EMAIL_QUEUE_OPTIONS, type EmailJobData, enqueueEmails } from "@/lib/mail/queue";
import { createSmtpTransport, processEmailJob } from "@/lib/mail/send-email";
import { rolloverLeaveBalances } from "@/lib/services/leave-balance";
import { FEATURES } from "@/lib/features";
import { assetReminders, certificateReminders } from "@/lib/services/reminder";

const LEAVE_ROLLOVER_QUEUE = "leave.rollover";
const REMINDER_JOBS: Record<string, typeof certificateReminders> = {
  "reminder.certificate": certificateReminders,
  ...(FEATURES.inventory ? { "reminder.asset": assetReminders } : {}),
};

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
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
    `[worker] siap. Queue: ${EMAIL_QUEUE}, ${LEAVE_ROLLOVER_QUEUE} (00:30 WIB), ${Object.keys(REMINDER_JOBS).join(", ")} (07:00 WIB)`,
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
