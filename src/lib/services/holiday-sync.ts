// Sinkronisasi Kalender Libur dari kalender publik Google "Hari Libur di Indonesia" (2026-11-18, keputusan user).
// Worker setiap hari 06:00 WIB + tombol Admin "Sinkronkan sekarang". Jangkauan: besok s/d akhir tahun depan (≥ 1 tahun).
//
// Aturan ("kalau ada perubahan dicek lagi; kalau sudah tetap, tanggal yang salah segera diperbaiki"):
//  - Libur MANUAL (diisi / diimpor Admin) tidak pernah diubah; libur yang dihapus Admin tidak dimunculkan lagi.
//  - Tahun yang belum pernah disinkronkan → libur dari sumber langsung ditambahkan (impor awal).
//  - Selebihnya setiap perbedaan untuk libur SYNC (tambah / hapus / ganti nama) = perubahan: dicatat dulu
//    (HolidayPendingChange), DITERAPKAN bila masih sama ≥ 20 jam kemudian (cek harian berikutnya); berubah lagi / hilang
//    sebelum itu → dibatalkan (melindungi dari kesalahan sementara di sumber).
//  - Rem: > 6 perubahan siap sekaligus → tidak diterapkan (kemungkinan sumber sedang salah), tampil di kartu & lonceng.
//  - Hari ini & tanggal lampau tidak pernah diubah. Cuti bersama tidak diambil (kebijakan HR, `INCLUDE_CUTI_BERSAMA`).
//  - Saldo cuti TIDAK dikoreksi otomatis: pengajuan cuti (menunggu / disetujui) yang hari kerjanya ikut berubah dicatat
//    di HolidayChange & dikirim ke penerima notifikasi (Setting → Jatah Cuti; keputusan user: Ci Ika & Ko Rudy; belum
//    diatur → semua Admin aktif). Semua perubahan diaudit; satu sinkronisasi berjalan pada satu waktu (advisory lock).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HolidayChangeKind, Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { type ExternalHoliday, fetchGoogleHolidays, HolidaySourceError } from "@/lib/holidays/google-calendar";
import { addDays, countWorkingDays } from "@/lib/leave";
import type { HolidayNotifyUsersInput } from "@/lib/validators/leave";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export const HOLIDAY_SYNC_QUEUE = "holiday.sync";
export const HOLIDAY_SYNC_STATUS_KEY = "holiday.sync.last";
export const HOLIDAY_NOTIFY_USERS_KEY = "holiday.notifyUserIds";
/** Cuti bersama ikut diambil? Kebijakan HR — bawaan: tidak (Admin menambahkannya manual bila kantor ikut libur). */
const INCLUDE_CUTI_BERSAMA = false;
/** Perubahan diterapkan bila masih sama setelah sekian jam (cek harian berikutnya; klik tombol di hari yang sama tidak). */
export const CONFIRM_AFTER_HOURS = 20;
/** Rem: perubahan siap lebih dari ini dalam satu kali sinkronisasi → ditahan. */
export const MAX_CHANGES_PER_RUN = 6;
/** Riwayat perubahan yang ditampilkan di kartu & lonceng. */
export const CHANGE_HISTORY_DAYS = 30;
const HOUR_MS = 3_600_000;

export type HolidayChangeView = { kind: HolidayChangeKind; date: string; name: string; previousName: string | null };

export type HolidaySyncResult = {
  at: string;
  /** Ketersediaan data di sumber untuk tahun ini & tahun depan (jumlah libur yang diambil). */
  years: { year: number; available: boolean; holidays: number }[];
  /** Diterapkan pada sinkronisasi ini. */
  applied: HolidayChangeView[];
  /** Menunggu konfirmasi (diterapkan setelah `applyAfter` bila masih sama). */
  pending: (HolidayChangeView & { applyAfter: string })[];
  /** Libur nasional MANUAL di jangkauan yang tidak ada di sumber — hanya dilaporkan. */
  unmanaged: { date: string; name: string }[];
  /** Rem aktif: perubahan siap terlalu banyak, tidak diterapkan. */
  blocked: boolean;
  error: string | null;
  /** Id sinkronisasi yang menerapkan perubahan (dasar notifikasi); null = tidak ada yang diterapkan. */
  runId: string | null;
};

type Source = () => Promise<ExternalHoliday[]>;
type Change = HolidayChangeView;
const keyOf = (change: { kind: HolidayChangeKind; date: string }) => `${change.kind}|${change.date}`;
const iso = (date: Date) => toJakartaIsoDate(date);
const wantedKind = (holiday: ExternalHoliday) => INCLUDE_CUTI_BERSAMA || holiday.kind === "NATIONAL";
const isWorkingDay = (date: string) => countWorkingDays(date, date, new Set()) === 1;

/** Terapkan satu perubahan; status baris dicek ulang (Admin bisa mengubah libur bersamaan). false = dilewati. */
async function applyChange(tx: Tx, change: Change, actorId: string | null): Promise<boolean> {
  const date = fromIsoDate(change.date);
  const existing = await tx.holiday.findUnique({ where: { date } });
  if (change.kind === "ADD") {
    if (existing && !(existing.deletedAt && existing.removedBySync && existing.source === "SYNC")) return false;
    const data = { name: change.name, isNational: true, source: "SYNC" as const, deletedAt: null, removedBySync: false };
    const saved = existing ? await tx.holiday.update({ where: { id: existing.id }, data }) : await tx.holiday.create({ data: { ...data, date } });
    await logAudit(tx, { actorId, action: "CREATE", entity: "Holiday", entityId: saved.id, before: existing, after: saved });
    return true;
  }
  if (!existing || existing.deletedAt || existing.source !== "SYNC") return false;
  const saved =
    change.kind === "RENAME"
      ? await tx.holiday.update({ where: { id: existing.id }, data: { name: change.name } })
      : await tx.holiday.update({ where: { id: existing.id }, data: { deletedAt: new Date(), removedBySync: true } });
  await logAudit(tx, { actorId, action: change.kind === "RENAME" ? "UPDATE" : "DELETE", entity: "Holiday", entityId: existing.id, before: existing, after: saved });
  return true;
}

/** Pengajuan cuti (menunggu / disetujui) yang hari kerjanya ikut berubah karena tanggal ini jadi / batal libur. */
async function affectedLeaveIds(tx: Tx, change: Change): Promise<string[]> {
  if (change.kind === "RENAME" || !isWorkingDay(change.date)) return [];
  const date = fromIsoDate(change.date);
  const leaves = await tx.leaveRequest.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
    orderBy: { startDate: "asc" },
  });
  return leaves.map((leave) => leave.id);
}

/**
 * Satu kali sinkronisasi. Tidak melempar error: hasil (termasuk pesan error) disimpan di AppSetting untuk kartu Admin.
 * `source`, `todayIso`, `now` bisa diganti untuk test.
 */
export async function syncHolidays(
  db: PrismaClient,
  options: { actorId?: string | null; todayIso?: string; now?: Date; source?: Source } = {},
): Promise<HolidaySyncResult> {
  const now = options.now ?? new Date();
  const todayIso = options.todayIso ?? toJakartaIsoDate(now);
  const thisYear = Number(todayIso.slice(0, 4));
  const from = addDays(todayIso, 1);
  const to = `${thisYear + 1}-12-31`;
  const actorId = options.actorId ?? null;
  const result: HolidaySyncResult = { at: now.toISOString(), years: [], applied: [], pending: [], unmanaged: [], blocked: false, error: null, runId: null };

  try {
    const all = (await (options.source ?? fetchGoogleHolidays)()).filter(wantedKind);
    result.years = [thisYear, thisYear + 1].map((year) => {
      const holidays = all.filter((holiday) => holiday.date.startsWith(`${year}-`)).length;
      return { year, available: holidays > 0, holidays };
    });
    const wanted = all.filter((holiday) => holiday.date >= from && holiday.date <= to);
    const sourceDates = new Set(wanted.map((holiday) => holiday.date));

    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('holiday.sync'))`;
        const rows = await tx.holiday.findMany({ where: { date: { gte: fromIsoDate(from), lte: fromIsoDate(to) } } });
        const byDate = new Map(rows.map((row) => [iso(row.date), row]));
        const syncedYears = new Set(
          (await tx.holiday.findMany({ where: { source: "SYNC", date: { gte: fromIsoDate(`${thisYear}-01-01`), lte: fromIsoDate(to) } }, select: { date: true } })).map(
            (row) => iso(row.date).slice(0, 4),
          ),
        );

        // 1. Bandingkan sumber dengan Kalender Libur OA.
        const immediate: Change[] = [];
        const changes: Change[] = [];
        for (const holiday of wanted) {
          const row = byDate.get(holiday.date);
          const add: Change = { kind: "ADD", date: holiday.date, name: holiday.name, previousName: null };
          if (!row) (syncedYears.has(holiday.date.slice(0, 4)) ? changes : immediate).push(add);
          else if (row.deletedAt) {
            if (row.source === "SYNC" && row.removedBySync) changes.push(add); // pernah dihapus sinkronisasi, muncul lagi
          } else if (row.source === "SYNC" && row.name !== holiday.name) {
            changes.push({ kind: "RENAME", date: holiday.date, name: holiday.name, previousName: row.name });
          }
        }
        for (const row of rows) {
          if (row.source === "SYNC" && !row.deletedAt && !sourceDates.has(iso(row.date))) {
            changes.push({ kind: "REMOVE", date: iso(row.date), name: row.name, previousName: null });
          }
        }
        result.unmanaged = rows
          .filter((row) => row.source === "MANUAL" && row.isNational && !row.deletedAt && !sourceDates.has(iso(row.date)))
          .map((row) => ({ date: iso(row.date), name: row.name }));

        // 2. Konfirmasi: perubahan diterapkan bila sudah terlihat sama ≥ CONFIRM_AFTER_HOURS.
        const pendingRows = await tx.holidayPendingChange.findMany();
        const pendingByKey = new Map(pendingRows.map((row) => [keyOf({ kind: row.kind, date: iso(row.date) }), row]));
        const ready: Change[] = [];
        const waiting: (Change & { firstSeenAt: Date })[] = [];
        for (const change of changes) {
          const seen = pendingByKey.get(keyOf(change));
          if (seen && seen.name === change.name && seen.previousName === change.previousName) {
            if (now.getTime() - seen.firstSeenAt.getTime() >= CONFIRM_AFTER_HOURS * HOUR_MS) ready.push(change);
            else waiting.push({ ...change, firstSeenAt: seen.firstSeenAt });
            await tx.holidayPendingChange.update({ where: { id: seen.id }, data: { lastSeenAt: now } });
          } else {
            const data = { name: change.name, previousName: change.previousName, firstSeenAt: now, lastSeenAt: now };
            await tx.holidayPendingChange.upsert({
              where: { kind_date: { kind: change.kind, date: fromIsoDate(change.date) } },
              create: { kind: change.kind, date: fromIsoDate(change.date), ...data },
              update: data,
            });
            waiting.push({ ...change, firstSeenAt: now });
          }
        }
        // Perubahan yang tidak terlihat lagi di sumber → batal.
        const live = new Set(changes.map(keyOf));
        const stale = pendingRows.filter((row) => !live.has(keyOf({ kind: row.kind, date: iso(row.date) }))).map((row) => row.id);
        if (stale.length) await tx.holidayPendingChange.deleteMany({ where: { id: { in: stale } } });

        // 3. Rem perubahan massal.
        if (ready.length > MAX_CHANGES_PER_RUN) {
          result.blocked = true;
          for (const change of ready.splice(0)) {
            waiting.push({ ...change, firstSeenAt: pendingByKey.get(keyOf(change))!.firstSeenAt });
          }
        }

        // 4. Terapkan + catat pengajuan cuti terdampak.
        const runId = randomUUID();
        for (const change of [...immediate, ...ready]) {
          if (!(await applyChange(tx, change, actorId))) continue;
          await tx.holidayChange.create({
            data: { runId, kind: change.kind, date: fromIsoDate(change.date), name: change.name, previousName: change.previousName, affectedLeaveIds: await affectedLeaveIds(tx, change) },
          });
          await tx.holidayPendingChange.deleteMany({ where: { kind: change.kind, date: fromIsoDate(change.date) } });
          result.applied.push(change);
        }
        if (result.applied.length) result.runId = runId;
        result.pending = waiting
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(({ firstSeenAt, ...change }) => ({ ...change, applyAfter: new Date(firstSeenAt.getTime() + CONFIRM_AFTER_HOURS * HOUR_MS).toISOString() }));
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof HolidaySourceError) result.error = error.message;
    else {
      console.error("[holiday.sync]", error);
      result.error = "Sinkronisasi gagal — tidak ada yang berubah; lihat log worker";
    }
    result.applied = [];
    result.runId = null;
  }

  const value = result as unknown as Prisma.InputJsonValue;
  await db.appSetting.upsert({ where: { key: HOLIDAY_SYNC_STATUS_KEY }, create: { key: HOLIDAY_SYNC_STATUS_KEY, value }, update: { value } });
  return result;
}

const changeViewSchema = z.object({
  kind: z.enum(["ADD", "REMOVE", "RENAME"]),
  date: z.string(),
  name: z.string(),
  previousName: z.string().nullable().catch(null),
});
/** Status tersimpan dibaca ulang dengan aman: format lama (versi apipedia) / rusak → bagian yang tidak dikenal dikosongkan. */
const statusSchema = z.object({
  at: z.string().catch(() => new Date(0).toISOString()),
  years: z.array(z.object({ year: z.number(), available: z.boolean(), holidays: z.number().catch(0) })).catch([]),
  applied: z.array(changeViewSchema).catch([]),
  pending: z.array(changeViewSchema.extend({ applyAfter: z.string() })).catch([]),
  unmanaged: z.array(z.object({ date: z.string(), name: z.string() })).catch([]),
  blocked: z.boolean().catch(false),
  error: z.string().nullable().catch(null),
  runId: z.string().nullable().catch(null),
});

export async function getHolidaySyncStatus(db: PrismaClient): Promise<HolidaySyncResult | null> {
  const row = await db.appSetting.findUnique({ where: { key: HOLIDAY_SYNC_STATUS_KEY } });
  if (!row) return null;
  const parsed = statusSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------
// Penerima notifikasi perubahan libur (Setting → Jatah Cuti)
// ---------------------------------------------------------------------

export async function getHolidayNotifyUserIds(db: PrismaClient | Tx): Promise<string[]> {
  const value = (await db.appSetting.findUnique({ where: { key: HOLIDAY_NOTIFY_USERS_KEY } }))?.value;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** Penerima aktif: yang diatur Admin; belum diatur / semuanya nonaktif → semua Admin aktif (supaya tidak ada yang terlewat). */
export async function holidayNotifyRecipients(db: PrismaClient) {
  const select = { id: true, email: true, employee: { select: { fullName: true } } } as const;
  const configured = await db.user.findMany({ where: { id: { in: await getHolidayNotifyUserIds(db) }, isActive: true }, select, orderBy: { email: "asc" } });
  return configured.length ? configured : db.user.findMany({ where: { role: "ADMIN", isActive: true }, select, orderBy: { email: "asc" } });
}

/** Simpan penerima (Admin). Hanya user aktif; duplikat dirapikan; tercatat di audit. */
export async function saveHolidayNotifyUsers(db: PrismaClient, actorId: string, input: HolidayNotifyUsersInput): Promise<void> {
  const ids = [...new Set(input.userIds)];
  await db.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } });
    if (users.length !== ids.length) throw new ServiceError("Ada user yang tidak ditemukan", "userIds");
    if (users.some((user) => !user.isActive)) throw new ServiceError("Hanya user aktif yang bisa menerima notifikasi", "userIds");
    const before = await getHolidayNotifyUserIds(tx);
    await tx.appSetting.upsert({ where: { key: HOLIDAY_NOTIFY_USERS_KEY }, create: { key: HOLIDAY_NOTIFY_USERS_KEY, value: ids }, update: { value: ids } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AppSetting", entityId: HOLIDAY_NOTIFY_USERS_KEY, before, after: ids });
  });
}

// ---------------------------------------------------------------------
// Riwayat perubahan + pengajuan cuti terdampak (kartu Kalender Libur, lonceng, email)
// ---------------------------------------------------------------------

export type AffectedLeaveView = {
  id: string;
  number: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  status: string;
  /** Akibat perubahan pada hari kerja cuti ini. */
  effect: string;
};

export type HolidayRunView = {
  runId: string;
  appliedAt: string;
  changes: (HolidayChangeView & { affected: AffectedLeaveView[] })[];
};

const EFFECT: Record<HolidayChangeKind, string> = {
  ADD: "hari kerja cuti berkurang 1 (tanggal ini jadi libur) — saldo mungkin terpotong 1 hari terlalu banyak",
  REMOVE: "hari kerja cuti bertambah 1 (tanggal ini batal libur) — saldo mungkin kurang terpotong 1 hari",
  RENAME: "",
};

/** Perubahan yang diterapkan dalam `CHANGE_HISTORY_DAYS` hari terakhir (atau satu sinkronisasi), terbaru dulu. */
export async function listHolidayRuns(db: PrismaClient, options: { runId?: string; now?: Date } = {}): Promise<HolidayRunView[]> {
  const since = new Date((options.now ?? new Date()).getTime() - CHANGE_HISTORY_DAYS * 24 * HOUR_MS);
  const rows = await db.holidayChange.findMany({
    where: options.runId ? { runId: options.runId } : { appliedAt: { gte: since } },
    orderBy: [{ appliedAt: "desc" }, { date: "asc" }],
    take: 200,
  });
  const leaveIds = [...new Set(rows.flatMap((row) => row.affectedLeaveIds))];
  const leaves = leaveIds.length
    ? await db.leaveRequest.findMany({
        where: { id: { in: leaveIds } },
        select: { id: true, number: true, startDate: true, endDate: true, status: true, employee: { select: { fullName: true } } },
      })
    : [];
  const leaveOf = new Map(leaves.map((leave) => [leave.id, leave]));
  const runs = new Map<string, HolidayRunView>();
  for (const row of rows) {
    const run = runs.get(row.runId) ?? { runId: row.runId, appliedAt: row.appliedAt.toISOString(), changes: [] };
    run.changes.push({
      kind: row.kind,
      date: iso(row.date),
      name: row.name,
      previousName: row.previousName,
      affected: row.affectedLeaveIds.flatMap((id) => {
        const leave = leaveOf.get(id);
        return leave
          ? [{ id, number: leave.number, employeeName: leave.employee.fullName, startDate: iso(leave.startDate), endDate: iso(leave.endDate), status: leave.status, effect: EFFECT[row.kind] }]
          : [];
      }),
    });
    runs.set(row.runId, run);
  }
  return [...runs.values()];
}
