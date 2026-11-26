// Booking ruang meeting (Fase 17, 2026-11-23) — tanpa approval, siapa cepat dia dapat.
//
// Pengaman race condition:
//  1. Bentrok jadwal dicegah DATABASE (exclusion constraint "MeetingBooking_no_overlap", lihat migrasi
//     20261123100000_meeting_room_booking): booking = satu INSERT/UPDATE, tanpa "cek dulu lalu simpan". Permintaan kedua
//     yang bersamaan menunggu yang pertama commit lalu gagal 23P01 → diterjemahkan jadi pesan bentrok.
//  2. Ubah satu kali & batal memakai UPDATE bersyarat (`editedAt: null` / `status: ACTIVE`) → dua tab tidak bisa dobel.
//  3. Booking mengunci baris ruang `FOR SHARE`, nonaktifkan ruang `FOR UPDATE` → tidak ada booking yang lolos ke ruang yang
//     baru dimatikan, dan ruang tidak bisa dimatikan sementara booking baru masuk.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { jakartaDateTime } from "@/lib/attendance";
import { fromIsoDate, formatTime, toJakartaIsoDate } from "@/lib/format";
import { bookingWindowProblem, DEFAULT_MEETING_HOURS, MAX_ACTIVE_BOOKINGS_PER_USER, type MeetingHours, timeRangeLabel } from "@/lib/meeting-room";
import type { CancelMeetingBookingInput, MeetingBookingInput, MeetingHoursInput } from "@/lib/validators/meeting-room";
import type { Actor } from "./access";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export const MEETING_HOURS_KEY = "meetingRoom.hours";
const OVERLAP_CONSTRAINT = "MeetingBooking_no_overlap";

/** Pelaku aksi booking: user login (nama dipakai di email pembatalan oleh Admin). */
export type BookingActor = Actor & { name: string };

// ---------------------------------------------------------------------------------------------------------------------
// Jam operasional (Setting → Ruang Meeting)
// ---------------------------------------------------------------------------------------------------------------------

export async function getMeetingHours(db: Tx | PrismaClient): Promise<MeetingHours> {
  const setting = await db.appSetting.findUnique({ where: { key: MEETING_HOURS_KEY } });
  const value = setting?.value as Partial<MeetingHours> | null;
  return value?.start && value?.end ? { start: value.start, end: value.end } : DEFAULT_MEETING_HOURS;
}

/** Berlaku untuk booking baru / yang diubah; booking yang sudah ada tidak disentuh. */
export async function saveMeetingHours(db: PrismaClient, actorId: string, input: MeetingHoursInput) {
  return db.$transaction(async (tx) => {
    const before = await getMeetingHours(tx);
    await tx.appSetting.upsert({
      where: { key: MEETING_HOURS_KEY },
      create: { key: MEETING_HOURS_KEY, value: input },
      update: { value: input },
    });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AppSetting", entityId: MEETING_HOURS_KEY, before, after: input });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Saklar ruang (Setting → Ruang Meeting)
// ---------------------------------------------------------------------------------------------------------------------

/** Nyalakan / matikan ruang. Mematikan ditolak bila ruang masih punya booking aktif yang belum selesai. */
export async function setMeetingRoomActive(db: PrismaClient, actorId: string, roomId: string, isActive: boolean, now = new Date()) {
  return db.$transaction(async (tx) => {
    // FOR UPDATE: menunggu booking yang sedang berjalan (FOR SHARE) selesai, dan menahan booking baru sampai commit.
    const [room] = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
      SELECT "id", "name", "isActive" FROM "MeetingRoom" WHERE "id" = ${roomId} FOR UPDATE`;
    if (!room) throw new ServiceError("Ruang tidak ditemukan");
    if (room.isActive === isActive) return;
    if (!isActive) {
      const upcoming = await tx.meetingBooking.count({ where: { roomId, status: "ACTIVE", endAt: { gt: now } } });
      if (upcoming > 0) {
        throw new ServiceError(
          `${room.name} masih punya ${upcoming} booking yang belum selesai. Ruang hanya bisa dinonaktifkan setelah booking tersebut dibatalkan atau selesai.`,
        );
      }
    }
    await tx.meetingRoom.update({ where: { id: roomId }, data: { isActive } });
    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "MeetingRoom",
      entityId: roomId,
      before: { isActive: room.isActive },
      after: { isActive },
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------------------------------------------------

const mailInclude = {
  room: { select: { name: true } },
  user: { select: { email: true, employee: { select: { fullName: true } } } },
} satisfies Prisma.MeetingBookingInclude;

type BookingWithMail = Prisma.MeetingBookingGetPayload<{ include: typeof mailInclude }>;

/** Isi email konfirmasi (src/lib/mail/meeting-booking-emails.ts). */
export type BookingMailInfo = {
  id: string;
  ownerEmail: string;
  ownerName: string;
  roomName: string;
  /** `YYYY-MM-DD` Jakarta. */
  date: string;
  start: string;
  end: string;
  agenda: string;
};

export type MeetingBookingEvent =
  | { kind: "CREATED"; booking: BookingMailInfo }
  | { kind: "UPDATED"; booking: BookingMailInfo; previous: BookingMailInfo }
  /** `cancelledByName` null = dibatalkan pemiliknya sendiri. */
  | { kind: "CANCELLED"; booking: BookingMailInfo; cancelledByName: string | null; reason: string | null };

function toMailInfo(booking: BookingWithMail): BookingMailInfo {
  return {
    id: booking.id,
    ownerEmail: booking.user.email,
    ownerName: booking.user.employee?.fullName ?? booking.user.email,
    roomName: booking.room.name,
    date: toJakartaIsoDate(booking.startAt),
    start: formatTime(booking.startAt),
    end: formatTime(booking.endAt),
    agenda: booking.agenda,
  };
}

/** Potret booking untuk audit log (tanpa data pemesan). */
function auditSnapshot(booking: { roomId: string; agenda: string; startAt: Date; endAt: Date; status: string }) {
  return { roomId: booking.roomId, agenda: booking.agenda, startAt: booking.startAt, endAt: booking.endAt, status: booking.status };
}

/**
 * Error dari exclusion constraint anti-bentrok. Driver adapter Prisma meneruskan kode PostgreSQL `23P01` di
 * `meta.driverAdapterError.cause.originalCode` (PrismaClientKnownRequestError P2039 untuk query model, P2010 untuk raw).
 */
export function isBookingOverlapError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = (error.meta?.driverAdapterError as { cause?: { originalCode?: string; originalMessage?: string } } | undefined)?.cause;
  if (cause?.originalCode === "23P01") return true;
  return error.message.includes(OVERLAP_CONSTRAINT) || Boolean(cause?.originalMessage?.includes(OVERLAP_CONSTRAINT));
}

/** Pesan bentrok berisi booking yang lebih dulu tersimpan (dibaca setelah transaksi gagal). */
async function overlapMessage(db: PrismaClient, roomId: string, startAt: Date, endAt: Date, excludeId?: string) {
  const other = await db.meetingBooking.findFirst({
    where: { roomId, status: "ACTIVE", startAt: { lt: endAt }, endAt: { gt: startAt }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    include: mailInclude,
    orderBy: { startAt: "asc" },
  });
  if (!other) return "Jam ini baru saja dibooking orang lain. Pilih jam atau ruang lain.";
  const info = toMailInfo(other);
  return `${info.roomName} sudah dibooking ${timeRangeLabel(info.start, info.end)} oleh ${info.ownerName}. Pilih jam atau ruang lain.`;
}

/** Kunci baris ruang (FOR SHARE) lalu pastikan ruang sedang beroperasi. */
async function lockActiveRoom(tx: Tx, roomId: string) {
  const [room] = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
    SELECT "id", "name", "isActive" FROM "MeetingRoom" WHERE "id" = ${roomId} FOR SHARE`;
  if (!room) throw new ServiceError("Ruang tidak ditemukan", "roomId");
  if (!room.isActive) throw new ServiceError(`${room.name} sedang tidak beroperasi`, "roomId");
  return room;
}

/** Aturan hari & jam (Senin–Jumat, bukan libur, jam operasional, kelipatan 30 menit, ≤ 30 hari, belum lewat). */
async function assertBookingWindow(tx: Tx, input: MeetingBookingInput, now: Date) {
  const [hours, holiday] = await Promise.all([
    getMeetingHours(tx),
    tx.holiday.findFirst({ where: { date: fromIsoDate(input.date), deletedAt: null }, select: { id: true } }),
  ]);
  const problem = bookingWindowProblem(input, { hours, now, holiday: Boolean(holiday) });
  if (problem) throw new ServiceError(problem);
}

function bookingTimes(input: MeetingBookingInput) {
  return { startAt: jakartaDateTime(input.date, input.start), endAt: jakartaDateTime(input.date, input.end) };
}

/**
 * F7 (audit keamanan 2026-11-26): batas booking aktif (ACTIVE & belum selesai) per orang, supaya satu orang tidak bisa
 * memborong semua slot. Admin tidak dibatasi. Kunci advisory per orang dipasang dulu, supaya dua booking bersamaan dari
 * orang yang sama dihitung bergiliran (tidak bisa lolos menjadi 11); orang lain tidak ikut menunggu.
 */
async function assertActiveBookingQuota(tx: Tx, actor: BookingActor, now: Date) {
  if (actor.role === "ADMIN") return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`meetingRoom.quota:${actor.id}`}))`;
  const active = await tx.meetingBooking.count({ where: { userId: actor.id, status: "ACTIVE", endAt: { gt: now } } });
  if (active >= MAX_ACTIVE_BOOKINGS_PER_USER) {
    throw new ServiceError(
      `Anda sudah punya ${MAX_ACTIVE_BOOKINGS_PER_USER} booking yang belum selesai. Batalkan salah satu, atau tunggu sampai booking terdekat selesai.`,
    );
  }
}

/** Booking baru: langsung berlaku (tanpa approval). Bentrok → ServiceError berisi siapa yang lebih dulu. */
export async function createMeetingBooking(
  db: PrismaClient,
  actor: BookingActor,
  input: MeetingBookingInput,
  now = new Date(),
): Promise<MeetingBookingEvent> {
  const { startAt, endAt } = bookingTimes(input);
  try {
    const booking = await db.$transaction(async (tx) => {
      const room = await lockActiveRoom(tx, input.roomId);
      await assertBookingWindow(tx, input, now);
      await assertActiveBookingQuota(tx, actor, now);
      // Satu INSERT: tumpang-tindih ditolak exclusion constraint secara atomik (tanpa cek-lalu-simpan).
      const created = await tx.meetingBooking.create({
        data: { roomId: room.id, userId: actor.id, agenda: input.agenda, startAt, endAt },
        include: mailInclude,
      });
      await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "MeetingBooking", entityId: created.id, after: auditSnapshot(created) });
      return created;
    });
    return { kind: "CREATED", booking: toMailInfo(booking) };
  } catch (error) {
    if (isBookingOverlapError(error)) throw new ServiceError(await overlapMessage(db, input.roomId, startAt, endAt));
    throw error;
  }
}

/** Ubah booking milik sendiri: ruang, tanggal, jam, agenda — hanya SATU kali per booking dan sebelum jam mulai. */
export async function updateMeetingBooking(
  db: PrismaClient,
  actor: BookingActor,
  bookingId: string,
  input: MeetingBookingInput,
  now = new Date(),
): Promise<MeetingBookingEvent> {
  const { startAt, endAt } = bookingTimes(input);
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.meetingBooking.findUnique({ where: { id: bookingId }, include: mailInclude });
      if (!before || before.userId !== actor.id) throw new ServiceError("Booking tidak ditemukan");
      if (before.status !== "ACTIVE") throw new ServiceError("Booking sudah dibatalkan");
      if (before.editedAt) {
        throw new ServiceError("Booking ini sudah pernah diubah. Booking hanya bisa diubah satu kali — batalkan lalu booking ulang bila perlu.");
      }
      if (before.startAt <= now) throw new ServiceError("Booking yang sudah dimulai tidak bisa diubah");
      const unchanged =
        before.roomId === input.roomId &&
        before.agenda === input.agenda &&
        before.startAt.getTime() === startAt.getTime() &&
        before.endAt.getTime() === endAt.getTime();
      if (unchanged) throw new ServiceError("Tidak ada perubahan. Jatah ubah satu kali belum terpakai.");

      const room = await lockActiveRoom(tx, input.roomId);
      await assertBookingWindow(tx, input, now);
      // Bersyarat `editedAt: null`: dua tab yang mengubah bersamaan → hanya satu yang berhasil (yang lain count = 0).
      const { count } = await tx.meetingBooking.updateMany({
        where: { id: bookingId, userId: actor.id, status: "ACTIVE", editedAt: null, startAt: { gt: now } },
        data: { roomId: room.id, agenda: input.agenda, startAt, endAt, editedAt: now },
      });
      if (count === 0) throw new ServiceError("Booking ini baru saja diubah atau dibatalkan. Muat ulang halaman.");
      const after = await tx.meetingBooking.findUniqueOrThrow({ where: { id: bookingId }, include: mailInclude });
      await logAudit(tx, {
        actorId: actor.id,
        action: "UPDATE",
        entity: "MeetingBooking",
        entityId: bookingId,
        before: auditSnapshot(before),
        after: auditSnapshot(after),
      });
      return { kind: "UPDATED" as const, booking: toMailInfo(after), previous: toMailInfo(before) };
    });
  } catch (error) {
    if (isBookingOverlapError(error)) throw new ServiceError(await overlapMessage(db, input.roomId, startAt, endAt, bookingId));
    throw error;
  }
}

/**
 * Batalkan booking. Pemilik: sebelum jam mulai. Admin: booking siapa pun sebelum jam selesai; alasan wajib bila bukan
 * miliknya (dikirim ke pemilik lewat email). Status jadi CANCELLED (riwayat tetap ada) dan jamnya langsung bebas.
 */
export async function cancelMeetingBooking(
  db: PrismaClient,
  actor: BookingActor,
  bookingId: string,
  input: CancelMeetingBookingInput,
  now = new Date(),
): Promise<MeetingBookingEvent> {
  return db.$transaction(async (tx) => {
    const booking = await tx.meetingBooking.findUnique({ where: { id: bookingId }, include: mailInclude });
    if (!booking) throw new ServiceError("Booking tidak ditemukan");
    const isOwner = booking.userId === actor.id;
    const isAdmin = actor.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new ServiceError("Anda hanya bisa membatalkan booking milik sendiri");
    if (booking.status !== "ACTIVE") throw new ServiceError("Booking sudah dibatalkan");
    if (booking.endAt <= now) throw new ServiceError("Booking yang sudah selesai tidak bisa dibatalkan");
    if (!isAdmin && booking.startAt <= now) throw new ServiceError("Booking yang sudah dimulai tidak bisa dibatalkan");
    const reason = input.reason ?? null;
    if (!isOwner && !reason) throw new ServiceError("Alasan wajib diisi saat membatalkan booking orang lain", "reason");

    // Bersyarat `status: ACTIVE`: klik ganda / dua Admin bersamaan tidak membatalkan dua kali.
    const { count } = await tx.meetingBooking.updateMany({
      where: { id: bookingId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id, cancelReason: reason },
    });
    if (count === 0) throw new ServiceError("Booking sudah dibatalkan");
    await logAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entity: "MeetingBooking",
      entityId: bookingId,
      before: auditSnapshot(booking),
      after: { ...auditSnapshot(booking), status: "CANCELLED", cancelReason: reason },
    });
    return { kind: "CANCELLED" as const, booking: toMailInfo(booking), cancelledByName: isOwner ? null : actor.name, reason };
  });
}
