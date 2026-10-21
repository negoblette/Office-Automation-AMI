// Proses satu job `email.send` di worker: render template → kirim SMTP → catat EmailLog.
import nodemailer, { type Transporter } from "nodemailer";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailJobData } from "./queue";
import { renderEmail } from "./render";

export type MailTransport = Pick<Transporter, "sendMail">;

/**
 * Opsi SMTP dari env. Produksi (atau `SMTP_REQUIRE_TLS=true`) WAJIB terenkripsi (hardening Tahap 6): port 465 = TLS
 * langsung, port lain wajib STARTTLS (`requireTLS`) — server tanpa TLS ditolak, bukan dikirim terbuka. Minimal TLS 1.2,
 * sertifikat server wajib valid. Dev (Mailpit localhost:1025) tanpa TLS & tanpa auth.
 */
export function smtpTransportOptions(env: Record<string, string | undefined> = process.env) {
  const port = Number(env.SMTP_PORT ?? 1025);
  const secure = port === 465;
  const enforceTls = env.NODE_ENV === "production" || env.SMTP_REQUIRE_TLS === "true";
  return {
    host: env.SMTP_HOST ?? "localhost",
    port,
    secure,
    ...(enforceTls ? { requireTLS: !secure, tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true } } : {}),
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  };
}

/** Transport SMTP dari env (dev: Mailpit localhost:1025 tanpa auth). */
export function createSmtpTransport(): Transporter {
  return nodemailer.createTransport(smtpTransportOptions());
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
