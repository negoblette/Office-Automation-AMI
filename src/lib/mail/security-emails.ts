// Email pemberitahuan keamanan akun (hardening Tahap 5): dikirim ke pemilik akun setiap kali password atau MFA
// berubah, supaya perubahan oleh orang lain cepat ketahuan. Panggil SETELAH transaksi commit.
import type { PrismaClient } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/format";
import type { RequestMeta } from "@/lib/request-meta";
import type { SecurityAlert } from "@/lib/services/security-monitor";
import { appUrl } from "./app-url";
import { enqueueEmails } from "./queue";

export type SecurityEvent =
  | { kind: "PASSWORD_CHANGED" }
  | { kind: "PASSWORD_RESET"; actorName: string }
  | { kind: "MFA_ENABLED" }
  | { kind: "MFA_RESET"; actorName: string }
  | { kind: "BACKUP_CODES_REGENERATED" }
  | { kind: "BACKUP_CODE_USED"; remaining: number };

function describe(event: SecurityEvent): { title: string; message: string } {
  switch (event.kind) {
    case "PASSWORD_CHANGED":
      return { title: "Password akun Anda diganti", message: "Password akun Office Automation Anda baru saja diganti. Semua sesi login sebelumnya sudah diakhiri." };
    case "PASSWORD_RESET":
      return {
        title: "Password akun Anda di-reset Admin",
        message: `Password akun Anda di-reset oleh ${event.actorName}. Masuk dengan password sementara dari Admin, lalu ganti dengan password baru.`,
      };
    case "MFA_ENABLED":
      return {
        title: "Verifikasi dua langkah (MFA) diaktifkan",
        message: "MFA diaktifkan untuk akun Anda. Mulai sekarang setiap login meminta kode 6 digit dari aplikasi authenticator di HP Anda.",
      };
    case "MFA_RESET":
      return {
        title: "MFA akun Anda di-reset Admin",
        message: `MFA akun Anda di-reset oleh ${event.actorName}. Saat login berikutnya Anda diminta mendaftarkan aplikasi authenticator lagi.`,
      };
    case "BACKUP_CODES_REGENERATED":
      return { title: "Kode cadangan MFA dibuat ulang", message: "Kode cadangan MFA akun Anda dibuat ulang. Kode cadangan lama tidak berlaku lagi." };
    case "BACKUP_CODE_USED":
      return {
        title: "Kode cadangan MFA dipakai untuk login",
        message: `Satu kode cadangan dipakai untuk masuk ke akun Anda. Sisa kode cadangan: ${event.remaining}.${event.remaining <= 3 ? " Segera buat ulang kode cadangan di halaman Keamanan Akun." : ""}`,
      };
  }
}

/** Enqueue email pemberitahuan ke pemilik akun. Gagal enqueue tidak menggagalkan aksi (lihat enqueueEmails). */
export async function enqueueSecurityNotice(db: PrismaClient, userId: string, event: SecurityEvent, meta?: RequestMeta): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, employee: { select: { fullName: true } } } });
  if (!user) return;
  const { title, message } = describe(event);
  await enqueueEmails(db, [
    {
      to: user.email,
      subject: `[Keamanan Akun] ${title}`,
      template: "security-notice",
      props: {
        recipientName: user.employee?.fullName ?? user.email,
        title,
        message,
        when: formatDateTime(new Date()),
        ip: meta?.ip ?? null,
        url: appUrl(event.kind.startsWith("PASSWORD") ? "/login" : "/mfa"),
      },
    },
  ]);
}

/**
 * Alarm keamanan (hardening Tahap 6) ke semua Admin aktif. `alert` null (sudah pernah dikirim dalam jendela yang sama)
 * → tidak ada email. Panggil SETELAH transaksi commit.
 */
export async function enqueueSecurityAlert(db: PrismaClient, alert: SecurityAlert | null): Promise<void> {
  if (!alert) return;
  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true, employee: { select: { fullName: true } } } });
  await enqueueEmails(
    db,
    admins.map((admin) => ({
      to: admin.email,
      subject: `[Alarm Keamanan] ${alert.title}`,
      template: "security-alert" as const,
      props: {
        recipientName: admin.employee?.fullName ?? admin.email,
        title: alert.title,
        message: "Sistem mendeteksi aktivitas yang perlu diperiksa:",
        when: formatDateTime(new Date()),
        ip: null, // IP & perangkat sudah ada di rincian alarm
        url: appUrl("/setting/user"),
        details: alert.details,
      },
    })),
  );
}
