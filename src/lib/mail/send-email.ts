// Proses satu job `email.send` di worker: render template → kirim SMTP → catat EmailLog.
import nodemailer, { type Transporter } from "nodemailer";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailJobData } from "./queue";
import { renderEmail } from "./render";

export type MailTransport = Pick<Transporter, "sendMail">;

/** Transport SMTP dari env (dev: Mailpit localhost:1025 tanpa auth). */
export function createSmtpTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT ?? 1025);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/**
 * Kirim email untuk satu job. Error dilempar ulang supaya pg-boss melakukan retry;
 * EmailLog tetap mencatat error terakhir (SENT jika retry berikutnya berhasil).
 */
export async function processEmailJob(db: PrismaClient, transport: MailTransport, data: EmailJobData): Promise<void> {
  try {
    const { html, text } = await renderEmail(data.template, data.props);
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? "Office Automation <no-reply@artha-mitra.local>",
      to: data.to,
      subject: data.subject,
      html,
      text,
    });
    await db.emailLog.update({ where: { id: data.emailLogId }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch (error) {
    await db.emailLog.update({
      where: { id: data.emailLogId },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
