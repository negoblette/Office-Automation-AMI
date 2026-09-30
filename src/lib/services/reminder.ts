// Reminder H-30 (URD CERT-03, INV-04, NTF-04; Tech Spec §7). Dipanggil worker setiap hari 07:00 WIB.
// Item yang berakhir dalam 0–30 hari dan belum pernah di-reminder untuk tanggal berakhir itu
// dicatat di ReminderLog lalu dibuatkan email. Worker yang mati beberapa hari tidak membuat
// reminder hilang; tanggal berakhir diubah → reminder baru.
import type { PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { daysUntil, EXPIRY_WARNING_DAYS } from "@/lib/certificate-status";
import { formatDate, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { CERTIFICATE_TYPE_LABEL } from "@/lib/labels";
import { addDays } from "@/lib/leave";
import { appUrl } from "@/lib/mail/app-url";
import type { OutgoingEmail } from "@/lib/mail/queue";

type Recipient = { email: string; name: string };

type DueItem = {
  kind: ReminderKind;
  entityId: string;
  dueDate: Date;
  itemKind: string;
  itemName: string;
  detailLine: string;
  /** Penerima + link masing-masing (karyawan ke Profil, Admin ke halaman kelola). */
  recipients: (Recipient & { path: string })[];
};

async function activeAdmins(db: PrismaClient): Promise<Recipient[]> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true, employee: { select: { fullName: true } } },
    orderBy: { email: "asc" },
  });
  return admins.map((a) => ({ email: a.email, name: a.employee?.fullName ?? a.email }));
}

/** Simpan ReminderLog untuk item yang belum pernah di-reminder, lalu buat email-nya. */
async function claimAndBuild(db: PrismaClient, items: DueItem[], todayIso: string): Promise<OutgoingEmail<"reminder-expiry">[]> {
  if (items.length === 0) return [];
  const existing = await db.reminderLog.findMany({
    where: { OR: items.map((i) => ({ kind: i.kind, entityId: i.entityId, dueDate: i.dueDate })) },
    select: { kind: true, entityId: true, dueDate: true },
  });
  const sent = new Set(existing.map((e) => `${e.kind}|${e.entityId}|${e.dueDate.getTime()}`));
  const fresh = items.filter((i) => !sent.has(`${i.kind}|${i.entityId}|${i.dueDate.getTime()}`));
  if (fresh.length === 0) return [];
  await db.reminderLog.createMany({
    data: fresh.map((i) => ({ kind: i.kind, entityId: i.entityId, dueDate: i.dueDate })),
    skipDuplicates: true,
  });

  return fresh.flatMap((item) => {
    const dueIso = toJakartaIsoDate(item.dueDate);
    const daysLeft = daysUntil(dueIso, todayIso);
    const when = daysLeft === 0 ? "hari ini" : `${daysLeft} hari lagi`;
    const seen = new Set<string>();
    return item.recipients
      .filter((r) => !seen.has(r.email) && seen.add(r.email))
      .map((r) => ({
        to: r.email,
        subject: `[Reminder] ${item.itemKind} ${item.itemName} berakhir ${when}`,
        template: "reminder-expiry" as const,
        props: {
          recipientName: r.name,
          itemKind: item.itemKind,
          itemName: item.itemName,
          detailLine: item.detailLine,
          dueDate: formatDate(item.dueDate),
          daysLeft,
          url: appUrl(r.path),
        },
      }));
  });
}

function window(todayIso: string) {
  return { gte: fromIsoDate(todayIso), lte: fromIsoDate(addDays(todayIso, EXPIRY_WARNING_DAYS)) };
}

/** `reminder.certificate`: sertifikat karyawan aktif yang berakhir H-30 → karyawan + semua Admin. */
export async function certificateReminders(db: PrismaClient, todayIso = toJakartaIsoDate()) {
  const certificates = await db.certificate.findMany({
    where: { endDate: window(todayIso), deletedAt: null, employee: { status: "ACTIVE" } },
    include: {
      employee: { select: { id: true, fullName: true, email: true, user: { select: { email: true, isActive: true } } } },
    },
    orderBy: { endDate: "asc" },
  });
  const admins = await activeAdmins(db);
  const items: DueItem[] = certificates.map((c) => {
    const owner = c.employee.user?.isActive ? [{ email: c.employee.user.email, name: c.employee.fullName, path: "/profil/sertifikat" }] : [];
    return {
      kind: "CERTIFICATE",
      entityId: c.id,
      dueDate: c.endDate as Date,
      itemKind: CERTIFICATE_TYPE_LABEL[c.type],
      itemName: c.name,
      detailLine: `Pemilik: ${c.employee.fullName}${c.issuer ? ` · Penerbit: ${c.issuer}` : ""}`,
      recipients: [...owner, ...admins.map((a) => ({ ...a, path: `/karyawan/${c.employee.id}?tab=sertifikat` }))],
    };
  });
  return claimAndBuild(db, items, todayIso);
}

/** `reminder.asset`: periode support / garansi unit yang berakhir H-30 → semua Admin (INV-04). */
export async function assetReminders(db: PrismaClient, todayIso = toJakartaIsoDate()) {
  const range = window(todayIso);
  const assets = await db.asset.findMany({
    where: { deletedAt: null, OR: [{ supportEnd: range }, { warrantyEnd: range }] },
    orderBy: { deviceName: "asc" },
  });
  const admins = await activeAdmins(db);
  const inRange = (d: Date | null): d is Date => d !== null && d >= range.gte && d <= range.lte;
  const items: DueItem[] = assets.flatMap((a) => {
    const base = {
      entityId: a.id,
      itemName: a.deviceName,
      detailLine: `Serial: ${a.serialNo}`,
      recipients: admins.map((admin) => ({ ...admin, path: `/inventory/${a.id}` })),
    };
    const due: DueItem[] = [];
    if (inRange(a.supportEnd)) due.push({ ...base, kind: "ASSET_SUPPORT", dueDate: a.supportEnd, itemKind: "Periode support unit" });
    if (inRange(a.warrantyEnd)) due.push({ ...base, kind: "ASSET_WARRANTY", dueDate: a.warrantyEnd, itemKind: "Garansi unit" });
    return due;
  });
  return claimAndBuild(db, items, todayIso);
}
