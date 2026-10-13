// Notifikasi lonceng di topbar (2026-10-13): satu daftar ringkas dari data yang sudah ada — tidak ada tabel
// notifikasi tersendiri, jadi selalu sesuai kondisi terkini.
// - Masa berlaku dokumen / sertifikat (karyawan: miliknya; Admin: semua karyawan)
// - Pengajuan yang menunggu persetujuan user (Approver / Admin)
// - Pengajuan milik user yang ditolak (30 hari terakhir) → perlu direvisi
import type { PrismaClient, Role } from "@/generated/prisma/client";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { toJakartaIsoDate } from "@/lib/format";
import { canApprove } from "@/lib/roles";
import { countPendingApprovals } from "./approval-queries";
import { expiryAlerts } from "./dashboard-queries";

export type NotificationItem = {
  key: string;
  kind: "expiry" | "approval" | "rejected";
  title: string;
  detail: string;
  href: string;
  /** danger = sudah lewat / ditolak; warning = segera; info = antrian approval. */
  tone: "danger" | "warning" | "info";
};

export async function getNotifications(
  db: PrismaClient,
  user: { id: string; role: Role; employeeId: string | null },
  todayIso = toJakartaIsoDate(),
): Promise<NotificationItem[]> {
  const isAdmin = user.role === "ADMIN";
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [expiring, pending, rejected] = await Promise.all([
    isAdmin ? expiryAlerts(db, todayIso) : user.employeeId ? expiryAlerts(db, todayIso, user.employeeId) : [],
    canApprove(user.role) ? countPendingApprovals(db, user.id) : 0,
    db.approvalRequest.findMany({
      where: { requesterId: user.id, status: "REJECTED", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { id: true, module: true, entityId: true, entityNumber: true },
    }),
  ]);

  // Sertifikat yang dihapus pemohon juga membuat verifikasinya REJECTED ("dibatalkan") — bukan penolakan.
  const certIds = rejected.filter((r) => r.module === "CERTIFICATE").map((r) => r.entityId);
  const deletedCerts = new Set(
    certIds.length ? (await db.certificate.findMany({ where: { id: { in: certIds }, deletedAt: { not: null } }, select: { id: true } })).map((c) => c.id) : [],
  );

  const items: NotificationItem[] = [];
  if (pending > 0) {
    items.push({ key: "approval", kind: "approval", title: `${pending} pengajuan menunggu persetujuan Anda`, detail: "Buka Approval Center", href: "/approval", tone: "info" });
  }
  for (const r of rejected) {
    if (r.module === "CERTIFICATE" && deletedCerts.has(r.entityId)) continue;
    const meta = APPROVAL_MODULE_META[r.module];
    items.push({ key: `rejected-${r.id}`, kind: "rejected", title: `${meta.label} ${r.entityNumber} ditolak`, detail: "Revisi lalu ajukan ulang", href: meta.path(r.entityId), tone: "danger" });
  }
  for (const e of expiring) {
    items.push({
      key: e.key,
      kind: "expiry",
      title: `${e.name} ${e.daysLeft < 0 ? "sudah kadaluarsa" : e.daysLeft === 0 ? "berakhir hari ini" : `berakhir ${e.daysLeft} hari lagi`}`,
      detail: [e.label, e.detail].filter(Boolean).join(" · "),
      href: e.href,
      tone: e.daysLeft <= 7 ? "danger" : "warning",
    });
  }
  return items;
}
