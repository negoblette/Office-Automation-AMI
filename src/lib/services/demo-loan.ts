// Peminjaman unit demo ke perusahaan lain = Product Trial Form (Fase 16, Tahap 16.2, 2026-11-17).
// Alur (keputusan user 2026-11-17):
//  1. Engineer / Sales mengajukan (kegunaan Backup Unit / POC) → nomor form terbit, approval engine modul DEMO_LOAN
//     (Approval Flow, default Ko Yosep). Ditolak → pemohon revisi & ajukan ulang (approval dimulai lagi), atau batalkan.
//  2. Disetujui final → status APPROVED = antrian Operational (Devi): pilih Item Sender, cetak form, antar
//     ("Sudah Diantar" → ON_LOAN, Tahap 16.3).
// Unit di peminjaman PENDING / APPROVED / ON_LOAN tidak bisa diajukan lagi: baris Asset dikunci (FOR UPDATE) supaya dua
// pengajuan bersamaan tidak sama-sama lolos. Email dikirim action SETELAH transaksi commit.
import { Prisma, type PrismaClient, type Role } from "@/generated/prisma/client";
import { ACTIVE_LOAN_STATUSES, formatHafNumber, formatTrialFormNumber, isEditableLoanStatus, LOAN_SALES_DIVISION, parseHafNumber, parseTrialFormNumber } from "@/lib/demo-loan";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { DeliverDemoLoanInput, DemoLoanInput, ItemSenderInput, ReturnDemoLoanInput, TrialFormCounterInput } from "@/lib/validators/demo-loan";
import { type ApprovalNotification, buildApproval, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { closePendingExtensions } from "./demo-loan-extension";
import { ServiceError } from "./errors";
import { inventoryAccess } from "./inventory-access";
import { HAF_PREFIX, nextHafNumber, nextTrialFormNumber, TRIAL_FORM_PREFIX } from "./numbering";
import { assertRackPosition } from "./storage-rack";

type Tx = Prisma.TransactionClient;

export type LoanActor = { id: string; role: Role; employeeId: string | null };

/** Tanggal mulai paling jauh 1 tahun ke depan. */
const MAX_START_AHEAD_DAYS = 365;

async function assertCanView(tx: Tx, actor: LoanActor) {
  if (!(await inventoryAccess(tx, actor)).canView) throw new ServiceError("Anda tidak punya akses ke Inventaris");
}

/** Kunci baris peminjaman: revisi, pembatalan, dan langkah Operational bersamaan dijalankan berurutan. */
async function lockLoan(tx: Tx, loanId: string) {
  await tx.$queryRaw`SELECT id FROM "DemoLoan" WHERE id = ${loanId} FOR UPDATE`;
  const loan = await tx.demoLoan.findUnique({ where: { id: loanId }, include: { items: true } });
  if (!loan) throw new ServiceError("Peminjaman tidak ditemukan");
  return loan;
}

/**
 * Unit yang dipilih: dikunci, harus masih terdaftar, dan tidak sedang ada di peminjaman aktif lain. Urutan pilihan
 * dipertahankan (= urutan baris di form).
 */
async function loadAvailableUnits(tx: Tx, assetIds: string[], exceptLoanId?: string) {
  await tx.$queryRaw`SELECT id FROM "Asset" WHERE id IN (${Prisma.join([...assetIds].sort())}) ORDER BY id FOR UPDATE`;
  const assets = await tx.asset.findMany({
    where: { id: { in: assetIds }, deletedAt: null },
    select: { id: true, deviceName: true, serialNo: true, rackId: true, rackPosition: true },
  });
  if (assets.length !== assetIds.length) {
    throw new ServiceError("Ada unit yang tidak ditemukan atau sudah dihapus. Muat ulang halaman lalu pilih lagi.", "assetIds");
  }
  const busy = await tx.demoLoanItem.findMany({
    where: {
      assetId: { in: assetIds },
      loan: { status: { in: [...ACTIVE_LOAN_STATUSES] }, ...(exceptLoanId ? { id: { not: exceptLoanId } } : {}) },
    },
    select: { asset: { select: { deviceName: true, serialNo: true } } },
  });
  if (busy.length) {
    const units = busy.map(({ asset }) => `${asset.deviceName} (SN ${asset.serialNo})`).join(", ");
    throw new ServiceError(`Unit sudah diajukan atau sedang dipinjam di peminjaman lain: ${units}. Hapus dari pilihan lalu coba lagi.`, "assetIds");
  }
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return assetIds.map((id) => byId.get(id)!);
}

type Unit = Awaited<ReturnType<typeof loadAvailableUnits>>[number];

const itemData = (unit: Unit) => ({
  assetId: unit.id,
  deviceName: unit.deviceName,
  serialNo: unit.serialNo,
  rackId: unit.rackId,
  rackPosition: unit.rackId ? unit.rackPosition : null,
});

async function assertSalesPerson(tx: Tx, employeeId: string) {
  const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { status: true, division: true } });
  if (employee?.status !== "ACTIVE" || employee.division !== LOAN_SALES_DIVISION) {
    throw new ServiceError("Sales Person harus karyawan aktif divisi Sales", "salesPersonId");
  }
}

function assertStartDate(startDate: string, today: string) {
  if (startDate < today) throw new ServiceError("Tanggal mulai tidak boleh sebelum hari ini", "startDate");
  const latest = new Date(fromIsoDate(today).getTime() + MAX_START_AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (startDate > latest) throw new ServiceError("Tanggal mulai paling lambat 1 tahun dari hari ini", "startDate");
}

/** Peminjam hybrid: nama yang sama dengan Customer aktif (tanpa beda huruf) ditautkan & ejaannya diseragamkan. */
async function resolveBorrower(tx: Tx, name: string) {
  const customer = await tx.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null }, select: { id: true, name: true } });
  return customer ? { customerId: customer.id, borrowerName: customer.name } : { customerId: null, borrowerName: name };
}

async function loanData(tx: Tx, input: DemoLoanInput) {
  return {
    ...(await resolveBorrower(tx, input.borrowerName)),
    purpose: input.purpose,
    purposeDetail: input.purpose === "OTHER" ? input.purposeDetail : null,
    picName: input.picName,
    picEmail: input.picEmail,
    salesPersonId: input.salesPersonId,
    startDate: fromIsoDate(input.startDate),
    dueDate: fromIsoDate(input.dueDate),
    remarks: input.remarks,
  };
}

/** Approval peminjaman ini yang masih berjalan sudah disetujui sebagian (flow lebih dari satu level). */
async function partlyApproved(tx: Tx, loanId: string) {
  const steps = await tx.approvalRequestStep.count({
    where: { status: "APPROVED", actedById: { not: null }, request: { module: "DEMO_LOAN", entityId: loanId, status: "PENDING" } },
  });
  return steps > 0;
}

/**
 * Ajukan peminjaman (semua yang boleh melihat Inventaris; pemohon wajib punya data karyawan untuk Approval Flow).
 * Kirim `notifications` (email approval) setelah commit.
 */
export async function submitDemoLoan(db: PrismaClient, actor: LoanActor, input: DemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertCanView(tx, actor);
    assertStartDate(input.startDate, today);
    await assertSalesPerson(tx, input.salesPersonId);
    const units = await loadAvailableUnits(tx, input.assetIds);
    // Bulan & tahun nomor = tanggal pengajuan (Jakarta).
    const number = await nextTrialFormNumber(tx, fromIsoDate(today));
    const loan = await tx.demoLoan.create({
      data: { ...(await loanData(tx, input)), number, requesterId: actor.id, submittedAt: new Date(), items: { create: units.map(itemData) } },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "DemoLoan", entityId: loan.id, after: loan });
    const approval = await buildApproval(tx, { module: "DEMO_LOAN", entityId: loan.id, entityNumber: number, requesterId: actor.id });
    return { loanId: loan.id, number, status: approval.status, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/**
 * Ubah pengajuan yang belum disetujui (pemohon). Yang ditolak diajukan ulang: approval dimulai lagi dari level 1 dengan
 * nomor yang sama (alasan tolak lama tetap di audit). Yang masih menunggu boleh diubah selama belum ada level yang setuju.
 */
export async function reviseDemoLoan(db: PrismaClient, actor: LoanActor, loanId: string, input: DemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    const before = await lockLoan(tx, loanId);
    if (before.requesterId !== actor.id) throw new ServiceError("Hanya pemohon yang bisa mengubah pengajuan ini");
    if (!isEditableLoanStatus(before.status)) throw new ServiceError("Pengajuan yang sudah disetujui atau dibatalkan tidak bisa diubah");
    if (before.status === "PENDING" && (await partlyApproved(tx, loanId))) {
      throw new ServiceError("Pengajuan sudah disetujui sebagian — tidak bisa diubah lagi");
    }
    await assertCanView(tx, actor);
    assertStartDate(input.startDate, today);
    await assertSalesPerson(tx, input.salesPersonId);
    const units = await loadAvailableUnits(tx, input.assetIds, loanId);
    await tx.demoLoanItem.deleteMany({ where: { loanId } });
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { ...(await loanData(tx, input)), status: "PENDING", submittedAt: new Date(), items: { create: units.map(itemData) } },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    const resubmitted = before.status === "REJECTED";
    const notifications = resubmitted
      ? (await restartApproval(tx, { module: "DEMO_LOAN", entityId: loanId, entityNumber: before.number, requesterId: actor.id })).notifications
      : [];
    return { loanId, resubmitted, notifications: notifications as ApprovalNotification[] };
  });
}

/**
 * Batalkan pengajuan yang belum disetujui (pemohon). Unit langsung bebas. Approval yang masih menunggu ditutup seperti
 * sertifikat yang dihapus: level yang belum diputuskan → REJECTED "Dibatalkan pemohon" (tidak muncul di antrian lagi).
 */
export async function cancelDemoLoan(db: PrismaClient, actor: LoanActor, loanId: string) {
  return db.$transaction(async (tx) => {
    const before = await lockLoan(tx, loanId);
    if (before.requesterId !== actor.id) throw new ServiceError("Hanya pemohon yang bisa membatalkan pengajuan ini");
    if (!isEditableLoanStatus(before.status)) throw new ServiceError("Pengajuan yang sudah disetujui atau dibatalkan tidak bisa dibatalkan lagi");
    const now = new Date();
    const request = await tx.approvalRequest.findUnique({ where: { module_entityId: { module: "DEMO_LOAN", entityId: loanId } } });
    if (request?.status === "PENDING") {
      await tx.approvalRequestStep.updateMany({
        where: { requestId: request.id, status: { in: ["PENDING", "WAITING"] } },
        data: { status: "REJECTED", note: "Dibatalkan pemohon", actedById: actor.id, actedAt: now },
      });
      await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "REJECTED", currentLevel: null, completedAt: now } });
    }
    const after = await tx.demoLoan.update({ where: { id: loanId }, data: { status: "CANCELLED" } });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

async function assertCanManage(tx: Tx, actor: LoanActor) {
  if (!(await inventoryAccess(tx, actor)).canManage) throw new ServiceError("Hanya Operational & Admin yang bisa menyiapkan peminjaman");
}

/**
 * Operational / Admin menyiapkan barang yang sudah disetujui: pilih pengantar (Item Sender). Yang memilih tercatat sebagai
 * "Operational" di form cetak.
 */
export async function setItemSender(db: PrismaClient, actor: LoanActor, loanId: string, input: ItemSenderInput) {
  return db.$transaction(async (tx) => {
    await assertCanManage(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "APPROVED") throw new ServiceError("Item Sender hanya bisa diatur untuk peminjaman yang sudah disetujui dan belum diantar");
    const sender = await tx.employee.findUnique({ where: { id: input.itemSenderId }, select: { status: true } });
    if (sender?.status !== "ACTIVE") throw new ServiceError("Item Sender harus karyawan aktif", "itemSenderId");
    const after = await tx.demoLoan.update({ where: { id: loanId }, data: { itemSenderId: input.itemSenderId, operationalId: actor.id } });
    await logAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entity: "DemoLoan",
      entityId: loanId,
      before: { itemSenderId: before.itemSenderId, operationalId: before.operationalId },
      after: { itemSenderId: after.itemSenderId, operationalId: after.operationalId },
    });
    return after;
  });
}

/**
 * Barang sudah diantar (Operational / Admin): status Dipinjam, tanggal antar & nama penerima. Item Sender wajib sudah
 * dipilih (namanya tercetak di form). Audit menyertakan unit supaya tercatat di Riwayat Unit ("Diantar ke peminjam").
 */
export async function markDemoLoanDelivered(db: PrismaClient, actor: LoanActor, loanId: string, input: DeliverDemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertCanManage(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "APPROVED") throw new ServiceError("Hanya peminjaman yang sudah disetujui dan belum diantar yang bisa ditandai diantar");
    if (!before.itemSenderId) throw new ServiceError("Pilih Item Sender (pengantar barang) dulu");
    if (input.deliveredAt > today) throw new ServiceError("Tanggal diantar tidak boleh di masa depan", "deliveredAt");
    if (input.deliveredAt < toJakartaIsoDate(before.submittedAt)) throw new ServiceError("Tanggal diantar tidak boleh sebelum tanggal pengajuan", "deliveredAt");
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { status: "ON_LOAN", deliveredAt: fromIsoDate(input.deliveredAt), receivedByName: input.receivedByName },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

/**
 * Pengembalian (Tahap 16.5, kembali sepenuhnya; Operational / Admin): semua unit dicek (kondisi + catatan) dan ditaruh
 * kembali di rak (posisi bawaan = posisi semula, bisa diganti). Lokasi unit diperbarui (tercatat di Riwayat Unit bila
 * berubah), nomor Hardware Admission Form terbit, status Selesai → unit bisa dipinjam lagi.
 */
export async function returnDemoLoan(db: PrismaClient, actor: LoanActor, loanId: string, input: ReturnDemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertCanManage(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "ON_LOAN") throw new ServiceError("Hanya peminjaman yang sedang dipinjam yang bisa diterima kembali");
    if (input.returnedAt > today) throw new ServiceError("Tanggal kembali tidak boleh di masa depan", "returnedAt");
    if (before.deliveredAt && input.returnedAt < toJakartaIsoDate(before.deliveredAt)) {
      throw new ServiceError("Tanggal kembali tidak boleh sebelum tanggal diantar", "returnedAt");
    }
    // Kembali sepenuhnya: setiap unit di peminjaman ini dicek tepat sekali.
    const checks = new Map(input.items.map((item) => [item.itemId, item]));
    if (checks.size !== input.items.length || before.items.length !== checks.size || before.items.some((item) => !checks.has(item.id))) {
      throw new ServiceError("Semua unit di peminjaman ini wajib dicek", "items");
    }
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id IN (${Prisma.join(before.items.map((item) => item.assetId).sort())}) ORDER BY id FOR UPDATE`;

    for (const item of before.items) {
      const check = checks.get(item.id)!;
      try {
        await assertRackPosition(tx, check.rackId, check.rackPosition);
      } catch (error) {
        // Pesan rak/posisi ditempel ke baris unit yang salah (urutan baris = urutan isian form).
        const index = input.items.findIndex((entry) => entry.itemId === item.id);
        if (error instanceof ServiceError && error.field) throw new ServiceError(error.message, `items.${index}.${error.field}`);
        throw error;
      }
      const rackPosition = check.rackId ? check.rackPosition : null;
      await tx.demoLoanItem.update({
        where: { id: item.id },
        data: { returnCondition: check.condition, returnNote: check.note, returnRackId: check.rackId, returnRackPosition: rackPosition },
      });
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: item.assetId } });
      if (asset.rackId !== check.rackId || asset.rackPosition !== rackPosition) {
        const moved = await tx.asset.update({ where: { id: asset.id }, data: { rackId: check.rackId, rackPosition } });
        await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Asset", entityId: asset.id, before: asset, after: moved });
      }
    }

    // Perpanjangan yang masih menunggu approval tidak berlaku lagi (Tahap 16.4).
    await closePendingExtensions(tx, loanId, actor.id);
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: {
        status: "RETURNED",
        returnedAt: fromIsoDate(input.returnedAt),
        returnedByName: input.returnedByName,
        returnNote: input.note,
        receivedById: actor.id,
        hafNumber: await nextHafNumber(tx, fromIsoDate(today)),
      },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

// ---------------------------------------------------------------------
// Nomor Product Trial Form & Hardware Admission Form (Setting → Inventaris & Rak, Admin)
// ---------------------------------------------------------------------

/** PTF = Product Trial Form (terbit saat diajukan); HAF = Hardware Admission Form (terbit saat barang kembali). */
export type FormKind = "PTF" | "HAF";

const FORM_PREFIX: Record<FormKind, string> = { PTF: TRIAL_FORM_PREFIX, HAF: HAF_PREFIX };

const counterWhere = (kind: FormKind, year: number) => ({ prefix_year_month: { prefix: FORM_PREFIX[kind], year, month: 0 } });

/** Nomor terakhir yang terpakai tahun ini & pratinjau nomor berikutnya. */
export async function getFormCounter(db: PrismaClient, kind: FormKind, at: Date = new Date()) {
  const [year, month] = toJakartaIsoDate(at).split("-").map(Number);
  const row = await db.numberSequence.findUnique({ where: counterWhere(kind, year) });
  const lastValue = row?.lastValue ?? 0;
  return { year, lastValue, nextNumber: kind === "PTF" ? formatTrialFormNumber(lastValue + 1, month, year) : formatHafNumber(lastValue + 1, year) };
}

export const getTrialFormCounter = (db: PrismaClient, at: Date = new Date()) => getFormCounter(db, "PTF", at);

/** Urutan tertinggi yang sudah dipakai form `kind` tahun `year`. */
async function highestUsedSequence(tx: Tx, kind: FormKind, year: number): Promise<number> {
  if (kind === "PTF") {
    const loans = await tx.demoLoan.findMany({ where: { number: { endsWith: `/${year}` } }, select: { number: true } });
    return Math.max(0, ...loans.map((loan) => parseTrialFormNumber(loan.number)?.sequence ?? 0));
  }
  const loans = await tx.demoLoan.findMany({ where: { hafNumber: { endsWith: `/${year}` } }, select: { hafNumber: true } });
  return Math.max(0, ...loans.map((loan) => (loan.hafNumber ? (parseHafNumber(loan.hafNumber)?.sequence ?? 0) : 0)));
}

/**
 * Atur nomor terakhir tahun ini (mis. melanjutkan nomor form manual: terakhir 008 → form berikutnya 009). Tidak boleh di
 * bawah nomor yang sudah terpakai di sistem, supaya tidak ada nomor ganda.
 */
export async function setFormCounter(db: PrismaClient, actorId: string, kind: FormKind, input: TrialFormCounterInput, at: Date = new Date()) {
  const [year] = toJakartaIsoDate(at).split("-").map(Number);
  const prefix = FORM_PREFIX[kind];
  await db.$transaction(async (tx) => {
    // Baris counter dibuat bila belum ada lalu dikunci; pengajuan / pengembalian yang sedang berjalan menunggu.
    await tx.$executeRaw`
      INSERT INTO "NumberSequence" ("prefix", "year", "month", "lastValue") VALUES (${prefix}, ${year}, 0, 0)
      ON CONFLICT ("prefix", "year", "month") DO NOTHING`;
    const [row] = await tx.$queryRaw<{ lastValue: number }[]>`
      SELECT "lastValue" FROM "NumberSequence" WHERE "prefix" = ${prefix} AND "year" = ${year} AND "month" = 0 FOR UPDATE`;
    const used = await highestUsedSequence(tx, kind, year);
    if (input.lastNumber < used) {
      throw new ServiceError(`Nomor sampai ${String(used).padStart(3, "0")} sudah terpakai tahun ini. Isi minimal ${used}.`, "lastNumber");
    }
    await tx.numberSequence.update({ where: counterWhere(kind, year), data: { lastValue: input.lastNumber } });
    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "NumberSequence",
      entityId: `${prefix}/${year}`,
      before: { lastValue: row.lastValue },
      after: { lastValue: input.lastNumber },
    });
  });
}

export const setTrialFormCounter = (db: PrismaClient, actorId: string, input: TrialFormCounterInput, at: Date = new Date()) =>
  setFormCounter(db, actorId, "PTF", input, at);