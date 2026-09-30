// Antrian email (pg-boss). Email TIDAK PERNAH dikirim langsung dari request web:
// aksi mencatat EmailLog (QUEUED) lalu mengirim job `email.send`; worker yang mengirim.
import { PgBoss } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailTemplateName, EmailTemplates } from "./render";

export const EMAIL_QUEUE = "email.send";

/** Retry 3× dengan backoff eksponensial (Tech Spec §7). */
export const EMAIL_QUEUE_OPTIONS = { retryLimit: 3, retryDelay: 30, retryBackoff: true } as const;

export type OutgoingEmail<T extends EmailTemplateName = EmailTemplateName> = {
  to: string;
  subject: string;
  template: T;
  props: EmailTemplates[T];
};

export type EmailJobData = OutgoingEmail & { emailLogId: string };

let bossPromise: Promise<PgBoss> | undefined;

/**
 * Klien pg-boss untuk MENGIRIM job dari aplikasi web. Maintenance, jadwal cron, dan
 * pembuatan schema dikerjakan worker (`npm run worker`), bukan di sini.
 */
function getBoss(): Promise<PgBoss> {
  bossPromise ??= (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schedule: false,
      supervise: false,
      migrate: false,
      max: 2,
    });
    boss.on("error", (error) => console.error("[pg-boss]", error));
    await boss.start();
    return boss;
  })().catch((error) => {
    bossPromise = undefined;
    throw error;
  });
  return bossPromise;
}

/**
 * Catat EmailLog lalu kirim job. Panggil SETELAH transaksi commit. Gagal enqueue tidak
 * menggagalkan aksi user — EmailLog ditandai FAILED supaya terlihat di log.
 */
export async function enqueueEmails(db: PrismaClient, emails: OutgoingEmail[]): Promise<void> {
  for (const email of emails) {
    const log = await db.emailLog.create({
      data: { to: email.to, subject: email.subject, template: email.template, status: "QUEUED" },
    });
    try {
      const boss = await getBoss();
      const data: EmailJobData = { ...email, emailLogId: log.id };
      await boss.send(EMAIL_QUEUE, data, EMAIL_QUEUE_OPTIONS);
    } catch (error) {
      console.error("[mail] gagal enqueue", error);
      await db.emailLog.update({
        where: { id: log.id },
        data: { status: "FAILED", error: `Gagal masuk antrian: ${error instanceof Error ? error.message : String(error)}` },
      });
    }
  }
}
