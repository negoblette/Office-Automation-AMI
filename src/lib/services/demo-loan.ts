// Peminjaman unit demo ke perusahaan lain = Product Trial Form (Fase 16, Tahap 16.2, 2026-11-17).
// Alur (keputusan user 2026-11-17, direvisi 2026-11-19):
//  1. Engineer / Sales mengajukan (kegunaan Backup Unit / POC; PIC = Engineer / Sales) → nomor form
//     `NNN/AMI-PTF/<pemilik unit>/<tahun>` terbit, approval engine modul DEMO_LOAN (Approval Flow, default Ko Yosep).
//     Ditolak → pemohon revisi & ajukan ulang (approval dimulai lagi), atau batalkan.
//  2. Disetujui final → status APPROVED = antrian Operational (Devi): pilih Item Sender, cetak form, antar
//     ("Sudah Diantar" → ON_LOAN, Tahap 16.3).
//  3. Barang akan diambil → Operational menjadwalkan pengambilan (tanggal + kurir AMI) → nomor HAF terbit, HAF dibawa
//     kurir (PICKUP). Barang tiba di AMI → Operational WAJIB mengisi Pengecekan Unit → semua Baik: RETURNED (Selesai);
//     ada yang Rusak / Tidak lengkap: FOLLOW_UP (2026-11-20) — PIC & Operational diberi tahu, unit bermasalah tertahan
//     sampai Operational menyelesaikan tindak lanjutnya → RETURNED.
// Langkah Operational HANYA untuk user yang ditunjuk di Setting → Inventaris & Rak; Admin tidak otomatis (2026-11-19).
// Unit yang tertahan (services/demo-loan-hold.ts) tidak bisa diajukan lagi: baris Asset dikunci (FOR UPDATE) supaya dua
// pengajuan bersamaan tidak sama-sama lolos. Email dikirim action SETELAH transaksi commit.
import { Prisma, type PrismaClient, type Role } from "@/generated/prisma/client";
import {
  addDaysIso,
  formatHafNumber,
  formatTrialFormNumber,
  isEditableLoanStatus,
  isProblemCondition,
  loanUnitOwners,
  MAX_PICKUP_AHEAD_DAYS,
  mixedOwnerMessage,
  OWNER_PLACEHOLDER,
  parseHafNumber,
  parseTrialFormNumber,
} from "@/lib/demo-loan";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type {
  DeliverDemoLoanInput,
  DemoLoanInput,
  ItemSenderInput,
  LoanPickupInput,
  ResolveFollowUpInput,
  ReturnDemoLoanInput,
  TrialFormCounterInput,
} from "@/lib/validators/demo-loan";
import { type ApprovalNotification, buildApproval, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { closePendingExtensions } from "./demo-loan-extension";
import { heldLoanItemWhere } from "./demo-loan-hold";
import { ServiceError } from "./errors";
import { assertOperational as assertOperationalAccess, assertInventoryPic, inventoryAccess } from "./inventory-access";
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
    select: { id: true, deviceName: true, serialNo: true, rackId: true, rackPosition: true, ownership: true, ownerName: true },
  });
  if (assets.length !== assetIds.length) {
    throw new ServiceError("Ada unit yang tidak ditemukan atau sudah dihapus. Muat ulang halaman lalu pilih lagi.", "assetIds");
  }
  const busy = await tx.demoLoanItem.findMany({
    where: { assetId: { in: assetIds }, ...heldLoanItemWhere(exceptLoanId) },
    select: { asset: { select: { deviceName: true, serialNo: true } } },
  });
  if (busy.length) {
    const units = busy.map(({ asset }) => `${asset.deviceName} (SN ${asset.serialNo})`).join(", ");
    throw new ServiceError(
      `Unit sudah diajukan, sedang dipinjam, atau masih ditindaklanjuti di peminjaman lain: ${units}. Hapus dari pilihan lalu coba lagi.`,
      "assetIds",
    );
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

/** PIC dari AMI (2026-11-19, dulu Sales Person): karyawan aktif divisi Engineer / Sales. */
const assertPic = (tx: Tx, employeeId: string) => assertInventoryPic(tx, employeeId);

/** Pemilik unit untuk nomor form (2026-11-19): semua unit dalam satu form harus satu pemilik. */
function loanOwner(units: Unit[]): string {
  const owners = loanUnitOwners(units);
  if (owners.length !== 1) throw new ServiceError(mixedOwnerMessage(owners), "assetIds");
  return owners[0];
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
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    picId: input.picId,
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
    await assertPic(tx, input.picId);
    const units = await loadAvailableUnits(tx, input.assetIds);
    const unitOwner = loanOwner(units);
    // Tahun nomor = tanggal pengajuan (Jakarta); segmen ketiga = pemilik unit.
    const number = await nextTrialFormNumber(tx, unitOwner, fromIsoDate(today));
    const loan = await tx.demoLoan.create({
      data: { ...(await loanData(tx, input)), number, unitOwner, requesterId: actor.id, submittedAt: new Date(), items: { create: units.map(itemData) } },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "DemoLoan", entityId: loan.id, after: loan });
    const approval = await buildApproval(tx, { module: "DEMO_LOAN", entityId: loan.id, entityNumber: number, requesterId: actor.id });
    return { loanId: loan.id, number, status: approval.status, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/**
 * Ubah pengajuan yang belum disetujui (pemohon). Yang ditolak diajukan ulang: approval dimulai lagi dari level 1 dengan
 * urutan nomor yang sama (alasan tolak lama tetap di audit). Yang masih menunggu boleh diubah selama belum ada level yang
 * setuju. Pemilik unit berubah → segmen pemilik di nomor ikut berubah (urutan & tahun tetap).
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
    await assertPic(tx, input.picId);
    const units = await loadAvailableUnits(tx, input.assetIds, loanId);
    const unitOwner = loanOwner(units);
    const parsed = parseTrialFormNumber(before.number);
    const number = parsed ? formatTrialFormNumber(parsed.sequence, unitOwner, parsed.year) : before.number;
    await tx.demoLoanItem.deleteMany({ where: { loanId } });
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { ...(await loanData(tx, input)), number, unitOwner, status: "PENDING", submittedAt: new Date(), items: { create: units.map(itemData) } },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    const resubmitted = before.status === "REJECTED";
    if (!resubmitted && number !== before.number) {
      // Approval yang masih berjalan menampilkan nomor terbaru (Approval Center, email keputusan).
      await tx.approvalRequest.updateMany({ where: { module: "DEMO_LOAN", entityId: loanId }, data: { entityNumber: number } });
    }
    const notifications = resubmitted
      ? (await restartApproval(tx, { module: "DEMO_LOAN", entityId: loanId, entityNumber: number, requesterId: actor.id })).notifications
      : [];
    return { loanId, number, resubmitted, notifications: notifications as ApprovalNotification[] };
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

/** Langkah Operational: hanya user yang ditunjuk di Setting → Inventaris & Rak — Admin tidak otomatis (2026-11-19). */
const assertOperational = (tx: Tx, actor: LoanActor) => assertOperationalAccess(tx, actor);

/**
 * Operational menyiapkan barang yang sudah disetujui: pilih pengantar (Item Sender). Yang memilih tercatat sebagai
 * "Operational" di form cetak.
 */
export async function setItemSender(db: PrismaClient, actor: LoanActor, loanId: string, input: ItemSenderInput) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
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
 * Barang sudah diantar (Operational): status Dipinjam, tanggal antar & nama penerima. Item Sender wajib sudah dipilih
 * (namanya tercetak di form). Audit menyertakan unit supaya tercatat di Riwayat Unit ("Diantar ke peminjam").
 */
export async function markDemoLoanDelivered(db: PrismaClient, actor: LoanActor, loanId: string, input: DeliverDemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
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
 * Jadwalkan pengambilan (2026-11-19, Operational): barang Dipinjam → Pengambilan. Nomor Hardware Admission Form terbit
 * (`NNN/AMI-HAF/<pemilik unit>/<tahun>`) dan HAF dicetak untuk dibawa kurir AMI ke peminjam. Dipanggil lagi saat status
 * Pengambilan = ubah jadwal / kurir (nomor HAF tetap). Perpanjangan yang masih menunggu ditutup. Audit menyertakan unit
 * supaya tercatat di Riwayat Unit.
 */
export async function scheduleLoanPickup(db: PrismaClient, actor: LoanActor, loanId: string, input: LoanPickupInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "ON_LOAN" && before.status !== "PICKUP") {
      throw new ServiceError("Pengambilan hanya bisa dijadwalkan untuk peminjaman yang barangnya sedang dipinjam");
    }
    if (before.deliveredAt && input.pickupDate < toJakartaIsoDate(before.deliveredAt)) {
      throw new ServiceError("Tanggal pengambilan tidak boleh sebelum tanggal diantar", "pickupDate");
    }
    if (input.pickupDate > addDaysIso(today, MAX_PICKUP_AHEAD_DAYS)) {
      throw new ServiceError(`Tanggal pengambilan paling lambat ${MAX_PICKUP_AHEAD_DAYS} hari dari hari ini`, "pickupDate");
    }
    const courier = await tx.employee.findUnique({ where: { id: input.courierId }, select: { status: true } });
    if (courier?.status !== "ACTIVE") throw new ServiceError("Kurir harus karyawan aktif", "courierId");
    if (before.status === "ON_LOAN") await closePendingExtensions(tx, loanId, actor.id);
    // Nomor HAF yang sudah pernah terbit (pengambilan dibatalkan lalu dijadwalkan lagi) dipakai lagi.
    const hafNumber = before.hafNumber ?? (await nextHafNumber(tx, before.unitOwner, fromIsoDate(today)));
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { status: "PICKUP", pickupDate: fromIsoDate(input.pickupDate), courierId: input.courierId, hafPreparedById: actor.id, hafNumber },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

/**
 * Batalkan pengambilan (Operational), mis. peminjam belum siap: kembali Dipinjam, jatuh tempo & pengingat berlaku lagi.
 * Nomor HAF tetap melekat (dipakai lagi saat dijadwalkan ulang), jadi tidak ada nomor yang terbuang.
 */
export async function cancelLoanPickup(db: PrismaClient, actor: LoanActor, loanId: string) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "PICKUP") throw new ServiceError("Hanya pengambilan yang belum dicek yang bisa dibatalkan");
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { status: "ON_LOAN", pickupDate: null, courierId: null, hafPreparedById: null },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

/**
 * Pengecekan Unit (Tahap 16.5; sejak 2026-11-19 setelah barang diambil kurir & tiba di AMI, kembali sepenuhnya;
 * Operational): semua unit dicek (kondisi + catatan) dan ditaruh kembali di rak (posisi bawaan = posisi semula, bisa
 * diganti). Lokasi unit diperbarui (tercatat di Riwayat Unit bila berubah). Sejak 2026-11-20 status menjadi Menunggu
 * verifikasi & approval engineer dimulai; kirim `notifications` (email approval) setelah commit. Nomor HAF sudah terbit
 * saat pengambilan dijadwalkan.
 */
export async function returnDemoLoan(db: PrismaClient, actor: LoanActor, loanId: string, input: ReturnDemoLoanInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "PICKUP") {
      throw new ServiceError("Pengecekan Unit hanya untuk peminjaman yang pengambilannya sudah dijadwalkan (HAF sudah terbit)");
    }
    if (input.returnedAt > today) throw new ServiceError("Tanggal tiba tidak boleh di masa depan", "returnedAt");
    if (before.pickupDate && input.returnedAt < toJakartaIsoDate(before.pickupDate)) {
      throw new ServiceError(
        `Tanggal tiba tidak boleh sebelum tanggal pengambilan di HAF (${toJakartaIsoDate(before.pickupDate)}). Ubah jadwal pengambilan dulu bila barang diambil lebih awal.`,
        "returnedAt",
      );
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

    // Hasil pengecekan diverifikasi engineer dulu (2026-11-20, approval DEMO_LOAN_RETURN, default Ko Yosep): disetujui →
    // Selesai, atau Perlu Tindak Lanjut bila ada unit Rusak / Tidak lengkap (demo-loan-return-effects.ts); ditolak →
    // kembali Pengambilan untuk dicek ulang. Pengecekan ulang setelah ditolak = approval dimulai lagi dari level 1.
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: {
        status: "RETURN_REVIEW",
        returnedAt: fromIsoDate(input.returnedAt),
        returnedByName: input.returnedByName,
        returnNote: input.note,
        receivedById: actor.id,
        followUpRemindedAt: null,
      },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    // Flow tanpa level / semua level terlewati → langsung disetujui (efek final berjalan di transaksi ini).
    const approval = await restartApproval(tx, { module: "DEMO_LOAN_RETURN", entityId: loanId, entityNumber: before.number, requesterId: actor.id });
    const loan = await tx.demoLoan.findUniqueOrThrow({ where: { id: loanId }, select: { id: true, status: true } });
    return { loanId: loan.id, status: loan.status, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/**
 * Selesaikan tindak lanjut (2026-11-20, Operational): setiap unit yang kembali Rusak / Tidak lengkap diisi hasilnya —
 * sudah lengkap / diperbaiki (kondisi akhir Baik) atau tetap rusak / tidak lengkap (kondisi akhir sama, unit tetap
 * ditandai di Daftar Unit) — dengan catatan penyelesaian. Status Selesai, unit bebas lagi. Audit memuat unit (Riwayat
 * Unit: "Tindak lanjut selesai").
 */
export async function resolveLoanFollowUp(db: PrismaClient, actor: LoanActor, loanId: string, input: ResolveFollowUpInput) {
  return db.$transaction(async (tx) => {
    await assertOperational(tx, actor);
    const before = await lockLoan(tx, loanId);
    if (before.status !== "FOLLOW_UP") throw new ServiceError("Peminjaman ini tidak sedang menunggu tindak lanjut");
    const problems = before.items.filter((item) => isProblemCondition(item.returnCondition) && !item.resolvedCondition);
    const results = new Map(input.items.map((item) => [item.itemId, item.result]));
    if (results.size !== input.items.length || results.size !== problems.length || problems.some((item) => !results.has(item.id))) {
      throw new ServiceError("Isi hasil tindak lanjut untuk setiap unit yang rusak / tidak lengkap", "items");
    }
    for (const item of problems) {
      await tx.demoLoanItem.update({
        where: { id: item.id },
        data: { resolvedCondition: results.get(item.id) === "RESOLVED" ? "GOOD" : item.returnCondition },
      });
    }
    const after = await tx.demoLoan.update({
      where: { id: loanId },
      data: { status: "RETURNED", followUpNote: input.note, followUpResolvedAt: new Date(), followUpResolvedById: actor.id },
      include: { items: true },
    });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "DemoLoan", entityId: loanId, before, after });
    return after;
  });
}

// ---------------------------------------------------------------------
// Nomor Product Trial Form & Hardware Admission Form (Setting → Inventaris & Rak, Admin)
// ---------------------------------------------------------------------

/** PTF = Product Trial Form (terbit saat diajukan); HAF = Hardware Admission Form (terbit saat pengambilan dijadwalkan). */
export type FormKind = "PTF" | "HAF";

const FORM_PREFIX: Record<FormKind, string> = { PTF: TRIAL_FORM_PREFIX, HAF: HAF_PREFIX };

const counterWhere = (kind: FormKind, year: number) => ({ prefix_year_month: { prefix: FORM_PREFIX[kind], year, month: 0 } });

/** Nomor terakhir yang terpakai tahun ini & pratinjau nomor berikutnya (segmen pemilik = contoh, terisi saat terbit). */
export async function getFormCounter(db: PrismaClient, kind: FormKind, at: Date = new Date()) {
  const [year] = toJakartaIsoDate(at).split("-").map(Number);
  const row = await db.numberSequence.findUnique({ where: counterWhere(kind, year) });
  const lastValue = row?.lastValue ?? 0;
  const format = kind === "PTF" ? formatTrialFormNumber : formatHafNumber;
  return { year, lastValue, nextNumber: format(lastValue + 1, OWNER_PLACEHOLDER, year) };
}

export const getTrialFormCounter = (db: PrismaClient, at: Date = new Date()) => getFormCounter(db, "PTF", at);

/** Urutan tertinggi yang sudah dipakai form `kind` tahun `year`. */
async function highestUsedSequence(tx: Tx, kind: FormKind, year: number): Promise<number> {
  if (kind === "PTF") {
    const loans = await tx.demoLoan.findMany({ where: { number: { endsWith: `/${year}` } }, select: { number: true } });
    return Math.max(0, ...loans.map((loan) => parseTrialFormNumber(loan.number)?.sequence ?? 0));
  }
  // HAF dipakai pengambilan peminjaman & penerimaan barang principal / distributor (2026-11-20) — satu counter.
  const [loans, receipts] = await Promise.all([
    tx.demoLoan.findMany({ where: { hafNumber: { endsWith: `/${year}` } }, select: { hafNumber: true } }),
    tx.goodsReceipt.findMany({ where: { hafNumber: { endsWith: `/${year}` } }, select: { hafNumber: true } }),
  ]);
  return Math.max(0, ...[...loans, ...receipts].map((row) => (row.hafNumber ? (parseHafNumber(row.hafNumber)?.sequence ?? 0) : 0)));
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