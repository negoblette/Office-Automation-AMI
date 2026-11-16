// Masukan aksi lonceng notifikasi (2026-11-16). Format kunci mengikuti services/notifications.ts; dibatasi ketat supaya
// tabel NotificationDismissal tidak bisa diisi kunci sembarang.
import { z } from "zod";

const ID = /^[\w-]{1,64}$/;

export const NOTIFICATION_KEY = /^(approval|rejected:[\w-]{1,64}:\d{1,16}|expiry:(?:doc|cert)-[\w-]{1,64}:\d{4}-\d{2}-\d{2}:(?:expired|week|month))$/;

export const notificationKeySchema = z.string().regex(NOTIFICATION_KEY, "Notifikasi tidak dikenal");

export const dismissNotificationSchema = z.object({
  key: notificationKeySchema,
  /** Antrian approval: id pengajuan yang dilihat user saat lonceng dibuka. */
  seen: z.array(z.string().regex(ID)).max(1000).optional(),
});

export type DismissNotificationInput = z.infer<typeof dismissNotificationSchema>;
