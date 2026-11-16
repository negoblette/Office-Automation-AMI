"use server";

import { type ActionResult, toActionError } from "@/lib/actions";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { dismissNotification, restoreNotification } from "@/lib/services/notifications";
import { dismissNotificationSchema, notificationKeySchema } from "@/lib/validators/notification";

/** Logout lalu kembali ke halaman login. */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

// Lonceng notifikasi (2026-11-16). Hanya preferensi tampilan pribadi (bukan data bisnis): tidak ditulis ke AuditLog
// yang permanen — mencatat setiap klik notifikasi hanya membengkakkan log. Tidak revalidatePath: lonceng menyembunyikan
// notifikasinya sendiri di browser, dan refresh di tengah navigasi (klik notifikasi) justru bisa saling berebut.

/** Notifikasi diklik atau dihapus (×). */
export async function dismissNotificationAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await dismissNotification(prisma, user, dismissNotificationSchema.parse(input));
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** "Urungkan" setelah menghapus notifikasi. */
export async function restoreNotificationAction(key: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await restoreNotification(prisma, user.id, notificationKeySchema.parse(key));
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
