// Notifikasi lonceng di topbar (2026-10-13): satu daftar ringkas dari data yang sudah ada — tidak ada tabel
// notifikasi tersendiri, jadi selalu sesuai kondisi terkini.
// - Masa berlaku dokumen / sertifikat (karyawan: miliknya; Admin: semua karyawan)
// - Pengajuan yang menunggu persetujuan user (Approver / Admin)
// - Pengajuan milik user yang ditolak (30 hari terakhir) → perlu direvisi
//
// Dibuka / dihapus (2026-11-16): notifikasi yang diklik atau dihapus (×) user disembunyikan untuk user itu lewat
// `NotificationDismissal`. Kunci tiap notifikasi memuat versinya, jadi kejadian baru tetap muncul:
// - ditolak  → id approval + waktu tolak (diajukan ulang lalu ditolak lagi = approval baru = kunci baru)
// - dokumen  → id + tanggal berakhir + tahap (30 hari → ≤ 7 hari → kadaluarsa; diperpanjang = tanggal baru)
// - antrian  → kunci tetap "approval"; muncul lagi bila ada pengajuan menunggu yang belum ada saat dihapus
//
// Peminjaman unit demo (Fase 16, 2026-11-17): disetujui & ditolak lewat approval engine (antrian approval Ko Yosep,
// "ditolak" untuk pemohon). Tambahan untuk Operational & Admin: peminjaman yang sudah disetujui & menunggu disiapkan
// (kunci tetap "loanqueue", aturannya sama dengan antrian approval).
import { Prisma, type PrismaClient, type Role } from "@/generated/prisma/client";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { addDaysIso, daysUntilDue, DUE_SOON_DAYS, dueLabel, dueNotificationStage } from "@/lib/demo-loan";
import { inventoryEnabled } from "@/lib/features";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { canApprove } from "@/lib/roles";
import { pendingApprovalIds } from "./approval-queries";
import { expiryAlerts } from "./dashboard-queries";
import { loansAwaitingOperational } from "./demo-loan-queries";
import { getHolidaySyncStatus, holidayNotifyRecipients, listHolidayRuns } from "./holiday-sync";
import { getOperationalUserIds, inventoryAccess } from "./inventory-access";

export type NotificationItem = {
  /** Kunci + versi notifikasi; dipakai untuk menyembunyikan (lihat atas). */
  key: string;
  kind: "expiry" | "approval" | "rejected" | "loan" | "holiday";
  title: string;
  detail: string;
  href: string;
  /** danger = sudah lewat / ditolak; warning = segera; info = antrian approval. */
  tone: "danger" | "warning" | "info";
  /** Antrian (approval / tinjauan peminjaman): id pengajuan menunggu yang dilihat user — dikirim balik saat menghapus. */
  seen?: string[];
};

type NotificationUser = { id: string; role: Role; employeeId: string | null; isSuperAdmin?: boolean };

/** Antrian Operational (Operational & Admin): peminjaman yang sudah disetujui & menunggu disiapkan / dicetak. */
async function loanQueue(db: PrismaClient, user: NotificationUser): Promise<NotificationItem | null> {
  if (!inventoryEnabled({ isSuperAdmin: Boolean(user.isSuperAdmin) })) return null;
  if (!(await inventoryAccess(db, user)).canManage) return null;
  const ids = await loansAwaitingOperational(db);
  if (ids.length === 0) return null;
  return {
    key: "loanqueue",
    kind: "loan",
    title: `${ids.length} peminjaman unit disetujui, siap disiapkan`,
    detail: "Siapkan barang, pilih Item Sender, cetak form",
    href: "/inventory/peminjaman",
    tone: "info",
    seen: ids,
  };
}

/**
 * Jatuh tempo peminjaman unit (Tahap 16.4): peminjaman yang sedang dipinjam & jatuh tempo ≤ 7 hari lagi atau sudah lewat.
 * Pemohon: miliknya; Operational (belum diatur → Admin): semua — sama dengan penerima email pengingat. Kunci memuat
 * jatuh tempo & tahap, jadi notifikasi yang dihapus muncul lagi saat terlambat / tiap 7 hari terlambat / diperpanjang.
 */
async function loanDueItems(db: PrismaClient, user: NotificationUser, todayIso: string): Promise<NotificationItem[]> {
  if (!inventoryEnabled({ isSuperAdmin: Boolean(user.isSuperAdmin) })) return [];
  const operationalIds = await getOperationalUserIds(db);
  const seesAll = operationalIds.length ? operationalIds.includes(user.id) : user.role === "ADMIN";
  const loans = await db.demoLoan.findMany({
    where: { status: "ON_LOAN", dueDate: { lte: fromIsoDate(addDaysIso(todayIso, DUE_SOON_DAYS)) }, ...(seesAll ? {} : { requesterId: user.id }) },
    orderBy: { dueDate: "asc" },
    take: 20,
    select: { id: true, number: true, borrowerName: true, dueDate: true, _count: { select: { items: true } } },
  });
  return loans.flatMap((loan) => {
    const dueIso = toJakartaIsoDate(loan.dueDate);
    const daysLeft = daysUntilDue(dueIso, todayIso);
    const stage = dueNotificationStage(daysLeft);
    if (!stage) return [];
    return [
      {
        key: `loandue:${loan.id}:${dueIso}:${stage}`,
        kind: "loan" as const,
        title: daysLeft < 0 ? `Peminjaman ${loan.number} ${dueLabel(daysLeft)}` : `Peminjaman ${loan.number} jatuh tempo ${dueLabel(daysLeft)}`,
        detail: `${loan.borrowerName} · ${loan._count.items} unit · ${daysLeft < 0 ? "barang belum kembali" : "siapkan pengembalian / perpanjangan"}`,
        href: `/inventory/peminjaman/${loan.id}`,
        tone: daysLeft < 0 ? ("danger" as const) : ("warning" as const),
      },
    ];
  });
}

/**
 * Kalender Libur (2026-11-18) untuk penerima notifikasi perubahan libur (Setting → Jatah Cuti; belum diatur → Admin):
 * setiap sinkronisasi yang menerapkan perubahan (30 hari terakhir, satu notifikasi per sinkronisasi) + sinkronisasi
 * yang ditahan rem (terlalu banyak perubahan sekaligus).
 */
async function holidayItems(db: PrismaClient, user: NotificationUser, now: Date): Promise<NotificationItem[]> {
  const recipients = await holidayNotifyRecipients(db);
  if (!recipients.some((recipient) => recipient.id === user.id)) return [];
  const [runs, status] = await Promise.all([listHolidayRuns(db, { now }), getHolidaySyncStatus(db)]);
  const items: NotificationItem[] = runs.map((run) => {
    const leaves = new Set(run.changes.flatMap((change) => change.affected.map((leave) => leave.id))).size;
    return {
      key: `holidaychange:${run.runId}`,
      kind: "holiday" as const,
      title: `Kalender libur diperbarui (${run.changes.length} perubahan)`,
      detail: leaves ? `${leaves} pengajuan cuti terdampak — cek saldo` : "Tidak ada pengajuan cuti terdampak",
      href: "/cuti/kalender#perubahan-libur",
      tone: leaves ? ("warning" as const) : ("info" as const),
    };
  });
  if (status?.blocked) {
    items.unshift({
      key: `holidaysync:blocked:${status.at.slice(0, 10)}`,
      kind: "holiday",
      title: "Sinkronisasi libur ditahan",
      detail: "Terlalu banyak perubahan sekaligus — periksa Kalender Libur",
      href: "/cuti/kalender#perubahan-libur",
      tone: "danger",
    });
  }
  return items;
}

const DAY_MS = 86_400_000;
const REJECTED_WINDOW_DAYS = 30;
/** Catatan "sudah dihapus" berlaku 60 hari; setelah itu notifikasi yang masih relevan muncul lagi. */
export const DISMISSAL_RETENTION_DAYS = 60;

/** Tahap mendesak masa berlaku: notifikasi dokumen yang dihapus muncul lagi saat naik tahap. */
export function expiryStage(daysLeft: number): "expired" | "week" | "month" {
  return daysLeft < 0 ? "expired" : daysLeft <= 7 ? "week" : "month";
}

const retentionStart = (now: Date) => new Date(now.getTime() - DISMISSAL_RETENTION_DAYS * DAY_MS);

/** Semua notifikasi yang berlaku sekarang, sebelum disaring catatan "sudah dihapus". */
async function collectNotifications(db: PrismaClient, user: NotificationUser, todayIso: string, now: Date): Promise<NotificationItem[]> {
  const isAdmin = user.role === "ADMIN";
  const since = new Date(now.getTime() - REJECTED_WINDOW_DAYS * DAY_MS);
  const [expiring, pendingIds, rejected, loanQueueItem, loanDue, holiday] = await Promise.all([
    isAdmin ? expiryAlerts(db, todayIso) : user.employeeId ? expiryAlerts(db, todayIso, user.employeeId) : [],
    canApprove(user.role) ? pendingApprovalIds(db, user.id) : [],
    db.approvalRequest.findMany({
      where: { requesterId: user.id, status: "REJECTED", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { id: true, module: true, entityId: true, entityNumber: true, completedAt: true },
    }),
    loanQueue(db, user),
    loanDueItems(db, user, todayIso),
    holidayItems(db, user, now),
  ]);

  // Sertifikat yang dihapus / peminjaman yang dibatalkan pemohon / perpanjangan yang dibatalkan (atau barang keburu
  // kembali) juga membuat approval-nya REJECTED ("dibatalkan") — bukan penolakan.
  const certIds = rejected.filter((r) => r.module === "CERTIFICATE").map((r) => r.entityId);
  const loanIds = rejected.filter((r) => r.module === "DEMO_LOAN").map((r) => r.entityId);
  const extensionIds = rejected.filter((r) => r.module === "DEMO_LOAN_EXTENSION").map((r) => r.entityId);
  const [deletedCertRows, cancelledLoanRows, cancelledExtensionRows] = await Promise.all([
    certIds.length ? db.certificate.findMany({ where: { id: { in: certIds }, deletedAt: { not: null } }, select: { id: true } }) : [],
    loanIds.length ? db.demoLoan.findMany({ where: { id: { in: loanIds }, status: "CANCELLED" }, select: { id: true } }) : [],
    extensionIds.length ? db.demoLoanExtension.findMany({ where: { id: { in: extensionIds }, status: "CANCELLED" }, select: { id: true } }) : [],
  ]);
  const cancelled = new Set([...deletedCertRows, ...cancelledLoanRows, ...cancelledExtensionRows].map((row) => row.id));

  const items: NotificationItem[] = [];
  if (pendingIds.length > 0) {
    items.push({
      key: "approval",
      kind: "approval",
      title: `${pendingIds.length} pengajuan menunggu persetujuan Anda`,
      detail: "Buka Approval Center",
      href: "/approval",
      tone: "info",
      seen: pendingIds,
    });
  }
  // Antrian Operational tepat setelah antrian approval, lalu jatuh tempo peminjaman (paling mendesak dulu).
  if (loanQueueItem) items.push(loanQueueItem);
  items.push(...loanDue, ...holiday);
  for (const r of rejected) {
    if (cancelled.has(r.entityId)) continue;
    const meta = APPROVAL_MODULE_META[r.module];
    items.push({
      key: `rejected:${r.id}:${r.completedAt?.getTime() ?? 0}`,
      kind: "rejected",
      title: `${meta.label} ${r.entityNumber} ditolak`,
      detail: r.module === "DEMO_LOAN_EXTENSION" ? "Jatuh tempo tidak berubah" : "Revisi lalu ajukan ulang",
      href: meta.path(r.entityId),
      tone: "danger",
    });
  }
  for (const e of expiring) {
    items.push({
      key: `expiry:${e.key}:${e.dueDate}:${expiryStage(e.daysLeft)}`,
      kind: "expiry",
      title: `${e.name} ${e.daysLeft < 0 ? "sudah kadaluarsa" : e.daysLeft === 0 ? "berakhir hari ini" : `berakhir ${e.daysLeft} hari lagi`}`,
      detail: [e.label, e.detail].filter(Boolean).join(" · "),
      href: e.href,
      tone: e.daysLeft <= 7 ? "danger" : "warning",
    });
  }
  return items;
}

/** Notifikasi lonceng user, tanpa yang sudah dibuka / dihapus. */
export async function getNotifications(
  db: PrismaClient,
  user: NotificationUser,
  todayIso = toJakartaIsoDate(),
  now = new Date(),
): Promise<NotificationItem[]> {
  const [items, dismissals] = await Promise.all([
    collectNotifications(db, user, todayIso, now),
    db.notificationDismissal.findMany({ where: { userId: user.id, dismissedAt: { gte: retentionStart(now) } }, select: { key: true, context: true } }),
  ]);
  const dismissed = new Map(dismissals.map((d) => [d.key, d.context ?? []]));
  return items.filter((item) => {
    const context = dismissed.get(item.key);
    if (!context) return true;
    // Antrian (approval / tinjauan peminjaman): tampil lagi hanya bila ada pengajuan yang belum ada saat dihapus.
    if (item.seen) return item.seen.some((id) => !context.includes(id));
    return false;
  });
}

/**
 * Sembunyikan satu notifikasi untuk user (diklik atau dihapus). Notifikasi yang sudah tidak berlaku (mis. sudah
 * diajukan ulang di tab lain) tidak dicatat — bukan error. Antrian approval mencatat pengajuan yang benar-benar
 * dilihat user (`seen`), dibatasi yang masih menunggu: yang masuk setelah lonceng dibuka tetap memunculkan notifikasi.
 * Mengembalikan true bila dicatat.
 */
export async function dismissNotification(
  db: PrismaClient,
  user: NotificationUser,
  input: { key: string; seen?: string[] },
  todayIso = toJakartaIsoDate(),
  now = new Date(),
): Promise<boolean> {
  const item = (await collectNotifications(db, user, todayIso, now)).find((candidate) => candidate.key === input.key);
  if (!item) return false;
  const context = item.seen ? item.seen.filter((id) => (input.seen ?? []).includes(id)) : [];
  await saveDismissal(db, user.id, item.key, context, now);
  // Bersihkan catatan lama milik user ini (lihat DISMISSAL_RETENTION_DAYS).
  await db.notificationDismissal.deleteMany({ where: { userId: user.id, dismissedAt: { lt: retentionStart(now) } } });
  return true;
}

/** Batalkan penghapusan (tombol "Urungkan"): notifikasi tampil lagi bila masih berlaku. */
export async function restoreNotification(db: PrismaClient, userId: string, key: string): Promise<void> {
  await db.notificationDismissal.deleteMany({ where: { userId, key } });
}

async function saveDismissal(db: PrismaClient, userId: string, key: string, context: string[], now: Date) {
  const where = { userId_key: { userId, key } };
  try {
    await db.notificationDismissal.upsert({ where, create: { userId, key, context, dismissedAt: now }, update: { context, dismissedAt: now } });
  } catch (error) {
    // Dua permintaan bersamaan (klik ganda, klik lalu ×): baris sudah dibuat permintaan lain → cukup perbarui.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await db.notificationDismissal.update({ where, data: { context, dismissedAt: now } });
    } else throw error;
  }
}
