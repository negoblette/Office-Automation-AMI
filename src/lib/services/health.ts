// Klaim kesehatan — URD HC-01..08, Tech Spec §6.3. Approval engine: Ika; klaim Ika sendiri → FALLBACK Rudy/Leonard.
// Draft (2026-11-23, persis seperti reimburse): Simpan Draft (nomor sementara, boleh belum lengkap) → Ajukan (nomor HC +
// cek plafon + approval dalam satu transaksi). Hanya pemohon yang boleh mengubah DRAFT / REJECTED; hanya DRAFT yang bisa dihapus.
import { randomUUID } from "node:crypto";
import { type HealthClaim, Prisma, type PrismaClient } from "@/generated/prisma/client";
import { formatRupiah, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { remainingPlafond } from "@/lib/health";
import { type HealthClaimDraftForm, type HealthClaimInput, type HealthPlafondInput, healthClaimSchema } from "@/lib/validators/health";
import type { Actor } from "./access";
import { type ApprovalNotification, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { lockPlafond } from "./health-payout";
import { nextDocumentNumber } from "./numbering";

type Tx = Prisma.TransactionClient;

/** Nomor sementara draft (sama dengan reimburse); nomor HC baru terbit saat diajukan. */
const DRAFT_NUMBER_PREFIX = "DRAFT-";

async function getRequester(tx: Tx, actor: Actor) {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan");
  const employee = await tx.employee.findUnique({ where: { id: actor.employeeId }, select: { id: true, status: true } });
  if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa mengajukan klaim");
  return employee;
}

/**
 * Klaim milik sendiri yang masih boleh diubah: DRAFT, atau REJECTED (revisi, 2026-10-12 OI-05). Baris klaim dikunci dulu
 * supaya dua kali tekan Ajukan tidak menerbitkan dua nomor.
 */
async function getOwnEditableClaim(tx: Tx, actor: Actor, claimId: string) {
  await tx.$queryRaw`SELECT id FROM "HealthClaim" WHERE id = ${claimId} FOR UPDATE`;
  const claim = await tx.healthClaim.findUnique({ where: { id: claimId, deletedAt: null }, include: { items: { orderBy: { id: "asc" } } } });
  if (!claim || claim.employeeId !== actor.employeeId) throw new ServiceError("Klaim tidak ditemukan");
  if (claim.status !== "DRAFT" && claim.status !== "REJECTED") throw new ServiceError("Klaim yang sudah diajukan tidak bisa diubah");
  return claim;
}

/** Isian lengkap → kolom klaim (total, tanggal terawal, kategori baris pertama) + baris. Kategori wajib masih aktif. */
async function buildClaimData(tx: Tx, input: HealthClaimInput) {
  const categories = await tx.healthCategory.findMany({ where: { id: { in: input.items.map((item) => item.categoryId) }, isActive: true }, select: { id: true } });
  const activeCategories = new Set(categories.map((c) => c.id));
  for (const [index, item] of input.items.entries()) {
    if (!activeCategories.has(item.categoryId)) throw new ServiceError(`Baris ${index + 1}: kategori klaim tidak tersedia`, `items.${index}.categoryId`);
  }
  const total = input.items.reduce((sum, item) => sum + item.amount, 0);
  const claimDate = input.items.map((item) => item.date).sort()[0];
  return {
    total,
    claimDate,
    data: { categoryId: input.items[0].categoryId, claimDate: fromIsoDate(claimDate), amount: BigInt(total), note: input.note, draftForm: Prisma.DbNull },
    items: input.items.map((item) => ({ categoryId: item.categoryId, date: fromIsoDate(item.date), amount: BigInt(item.amount), note: item.note })),
  };
}

export type SaveHealthDraftResult = { claimId: string };

/**
 * Simpan draft lengkap: baru (`claimId` null) atau ubah draft / revisi yang ditolak milik sendiri (status tetap).
 * Baris diganti seluruhnya. Plafon belum dicek — baru saat diajukan.
 */
export async function saveHealthClaimDraft(db: PrismaClient, actor: Actor, claimId: string | null, input: HealthClaimInput): Promise<SaveHealthDraftResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const before = claimId ? await getOwnEditableClaim(tx, actor, claimId) : null;
    const { data, items } = await buildClaimData(tx, input);

    let id: string;
    if (before) {
      await tx.healthClaimItem.deleteMany({ where: { claimId: before.id } });
      await tx.healthClaim.update({ where: { id: before.id }, data: { ...data, items: { create: items } } });
      id = before.id;
    } else {
      const created = await tx.healthClaim.create({
        data: { ...data, employeeId: employee.id, number: `${DRAFT_NUMBER_PREFIX}${randomUUID()}`, items: { create: items } },
      });
      id = created.id;
    }
    const after = await tx.healthClaim.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await logAudit(tx, { actorId: actor.id, action: before ? "UPDATE" : "CREATE", entity: "HealthClaim", entityId: id, before, after });
    return { claimId: id };
  });
}

/**
 * Simpan draft yang BELUM lengkap (sama dengan reimburse 2026-11-04): isian form disimpan apa adanya tanpa baris; kategori &
 * tanggal klaim kosong. Bisa dilanjutkan lewat Lanjutkan Mengisi dan baru bisa diajukan setelah lengkap. Bukan untuk revisi.
 */
export async function saveIncompleteHealthClaimDraft(
  db: PrismaClient,
  actor: Actor,
  claimId: string | null,
  form: HealthClaimDraftForm,
): Promise<SaveHealthDraftResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const before = claimId ? await getOwnEditableClaim(tx, actor, claimId) : null;
    if (before?.status === "REJECTED") throw new ServiceError("Lengkapi semua isian sebelum menyimpan revisi");
    const data = { note: form.note.trim() || null, draftForm: form, categoryId: null, claimDate: null, amount: 0n };

    let id: string;
    if (before) {
      await tx.healthClaimItem.deleteMany({ where: { claimId: before.id } });
      await tx.healthClaim.update({ where: { id: before.id }, data });
      id = before.id;
    } else {
      const created = await tx.healthClaim.create({ data: { ...data, employeeId: employee.id, number: `${DRAFT_NUMBER_PREFIX}${randomUUID()}` } });
      id = created.id;
    }
    await logAudit(tx, { actorId: actor.id, action: before ? "UPDATE" : "CREATE", entity: "HealthClaim", entityId: id, before, after: { id, incomplete: true, draftForm: form } });
    return { claimId: id };
  });
}

/**
 * Pemakaian plafon karyawan pada tahun klaim (HC-07): klaim APPROVED dihitung dari nominal
 * disetujui, klaim PENDING dari nominal diajukan (v1.14).
 */
export async function usedOrPendingAmount(db: Pick<PrismaClient, "healthClaim">, employeeId: string, year: number) {
  const grouped = await db.healthClaim.groupBy({
    by: ["status"],
    _sum: { amount: true, approvedAmount: true },
    where: {
      employeeId,
      status: { in: ["APPROVED", "PENDING"] },
      claimDate: { gte: fromIsoDate(`${year}-01-01`), lte: fromIsoDate(`${year}-12-31`) },
    },
  });
  return grouped.reduce((sum, g) => sum + Number((g.status === "APPROVED" ? g._sum.approvedAmount : g._sum.amount) ?? 0), 0);
}

export type SubmitHealthClaimResult = {
  claimId: string;
  number: string;
  status: "PENDING" | "APPROVED";
  notifications: ApprovalNotification[];
};

/**
 * Ajukan dari form: klaim baru, draft milik sendiri (`claimId` DRAFT → nomor HC baru), atau revisi yang ditolak (`claimId`
 * REJECTED, 2026-10-12 OI-05 → nomor tetap, approval mulai lagi). Isian, plafon, nomor & approval dalam satu transaksi.
 */
export async function submitHealthClaim(
  db: PrismaClient,
  actor: Actor,
  input: HealthClaimInput,
  claimId?: string,
): Promise<SubmitHealthClaimResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const existing = claimId ? await getOwnEditableClaim(tx, actor, claimId) : null;
    return submitInTransaction(tx, actor, employee.id, input, existing);
  });
}

/** Ajukan draft yang sudah tersimpan / ajukan ulang klaim yang ditolak tanpa mengubah isinya (tombol di halaman detail). */
export async function submitHealthClaimDraft(db: PrismaClient, actor: Actor, claimId: string): Promise<SubmitHealthClaimResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const draft = await getOwnEditableClaim(tx, actor, claimId);
    if (draft.draftForm !== null) throw new ServiceError("Draft belum lengkap. Tekan Lanjutkan Mengisi untuk melengkapi isiannya sebelum mengajukan");
    if (draft.items.length === 0) throw new ServiceError("Tambahkan minimal 1 baris sebelum mengajukan");
    // Isi tersimpan divalidasi ulang dengan aturan form (tahun sama, nominal > 0) sebelum dicek kategori & plafon.
    const input = healthClaimSchema.parse({
      items: draft.items.map((item) => ({ categoryId: item.categoryId, date: toJakartaIsoDate(item.date), amount: Number(item.amount), note: item.note })),
      note: draft.note,
    });
    return submitInTransaction(tx, actor, employee.id, input, draft);
  });
}

async function submitInTransaction(tx: Tx, actor: Actor, employeeId: string, input: HealthClaimInput, existing: HealthClaim | null): Promise<SubmitHealthClaimResult> {
  const { total, claimDate, data, items } = await buildClaimData(tx, input);

  // HC-07: total klaim dibatasi plafon tahunan (semua baris di tahun yang sama, dicek schema). Draft & klaim yang ditolak
  // tidak ikut dihitung terpakai.
  const year = Number(claimDate.slice(0, 4));
  const plafond = await lockPlafond(tx, employeeId, year);
  const remaining = remainingPlafond(Number(plafond.annualAmount), await usedOrPendingAmount(tx, employeeId, year));
  if (total > remaining) {
    throw new ServiceError(`Sisa plafon ${year} ${formatRupiah(Math.max(0, remaining))}, klaim ${formatRupiah(total)}`);
  }

  // Ajukan ulang setelah ditolak: nomor tetap. Klaim baru / draft: nomor HC terbit sekarang.
  const resubmit = existing?.status === "REJECTED";
  const number = existing && resubmit ? existing.number : await nextDocumentNumber(tx, "HC");
  const claimData = { ...data, number, status: "PENDING" as const, submittedAt: new Date() };
  if (existing) await tx.healthClaimItem.deleteMany({ where: { claimId: existing.id } });
  const claim = existing
    ? await tx.healthClaim.update({ where: { id: existing.id }, data: { ...claimData, items: { create: items } } })
    : await tx.healthClaim.create({ data: { ...claimData, employeeId, items: { create: items } } });
  const approval = await restartApproval(tx, { module: "HEALTH", entityId: claim.id, entityNumber: number, requesterId: actor.id });
  await logAudit(tx, { actorId: actor.id, action: existing ? "UPDATE" : "CREATE", entity: "HealthClaim", entityId: claim.id, before: existing, after: { ...claim, resubmit } });
  return { claimId: claim.id, number, status: approval.status, notifications: approval.notifications };
}

/** Hapus draft milik sendiri (soft delete, NFR v1.14). Klaim yang ditolak tidak bisa dihapus — direvisi / dibiarkan. */
export async function deleteHealthClaimDraft(db: PrismaClient, actor: Actor, claimId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const draft = await getOwnEditableClaim(tx, actor, claimId);
    if (draft.status !== "DRAFT") throw new ServiceError("Hanya draft yang bisa dihapus");
    await tx.healthClaim.update({ where: { id: draft.id }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "HealthClaim", entityId: draft.id, before: draft });
  });
}

/**
 * Atur plafon tahunan karyawan (HC-01). Plafon bulanan dihitung otomatis (OI-04). Plafon baru
 * tidak boleh lebih kecil dari klaim yang sudah disetujui/menunggu tahun itu.
 */
export async function setHealthPlafond(db: PrismaClient, actorId: string, input: HealthPlafondInput) {
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
    const used = await usedOrPendingAmount(tx, input.employeeId, input.year);
    if (input.annualAmount < used) {
      throw new ServiceError(`Plafon tidak boleh di bawah klaim yang sudah diajukan tahun ${input.year} (${formatRupiah(used)})`, "annualAmount");
    }

    const key = { employeeId_year: { employeeId: input.employeeId, year: input.year } };
    const before = await tx.healthPlafond.findUnique({ where: key });
    const data = { annualAmount: BigInt(input.annualAmount) };
    const after = await tx.healthPlafond.upsert({ where: key, create: { employeeId: input.employeeId, year: input.year, ...data }, update: data });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "HealthPlafond", entityId: after.id, before, after });
    return after;
  });
}

/** Tandai pembayaran bulan tertentu sudah/ belum dibayar (halaman Jadwal Pembayaran, Finance). */
export async function setPayoutPaid(db: PrismaClient, actorId: string, payoutId: string, paid: boolean) {
  return db.$transaction(async (tx) => {
    const before = await tx.healthPayout.findUnique({ where: { id: payoutId } });
    if (!before) throw new ServiceError("Jadwal pembayaran tidak ditemukan");
    const after = await tx.healthPayout.update({ where: { id: payoutId }, data: { paidAt: paid ? new Date() : null } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "HealthPayout", entityId: payoutId, before, after });
  });
}
