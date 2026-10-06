// Koreksi approver sebelum menyetujui (Fase 14). Keputusan user 2026-10-02: nominal & keterangan;
// diperluas 2026-10-06: reimburse per baris (tanggal, company, project, tipe, payment, nominal, lokasi,
// aktivitas, nama – jabatan, kwitansi), expense (tanggal, payment, nominal, keterangan), klaim
// kesehatan (keterangan; nominal lewat "Nominal disetujui"). Hanya approver step yang sedang PENDING.
// Setiap perubahan dicatat di ApprovalCorrection (sebelum → sesudah, oleh siapa, di level berapa).
import type { ApprovalModule, Prisma, PrismaClient } from "@/generated/prisma/client";
import { formatDate, formatRupiah, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, projectLabel } from "@/lib/labels";
import { canApprove } from "@/lib/roles";
import { NEW_ACQUISITION, reimbursementTotals } from "@/lib/validators/reimbursement";
import { logAudit } from "./audit";
import { ForbiddenError } from "./approval";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** Modul yang bisa dikoreksi; cuti tidak (tanggal cuti memengaruhi saldo). Revenue tidak dipakai lagi. */
export const CORRECTABLE_MODULES = ["REIMBURSE", "EXPENSE", "HEALTH"] as const satisfies readonly ApprovalModule[];

export type CorrectionValue = string | number | boolean | null;
export type CorrectionOption = { value: string; label: string; /** Nilai field `dependsOn` yang memiliki opsi ini. */ parent?: string };

export type CorrectionField = {
  key: string;
  label: string;
  kind: "date" | "amount" | "text" | "textarea" | "select" | "boolean";
  value: CorrectionValue;
  options?: CorrectionOption[];
  /** Opsi disaring berdasarkan nilai field lain di target yang sama (mis. project ← company). */
  dependsOn?: string;
  /** Boleh kosong (select project: "" = tanpa project). */
  optional?: boolean;
};

export type CorrectionTarget = { targetId: string; label: string; fields: CorrectionField[] };
export type CorrectionChange = { targetId: string; values: Record<string, CorrectionValue> };

const PAYMENT_OPTIONS = Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }));
const isoOf = (date: Date) => toJakartaIsoDate(date);

async function loadTargets(db: Db, module: ApprovalModule, entityId: string): Promise<CorrectionTarget[]> {
  switch (module) {
    case "REIMBURSE": {
      const reimbursement = await db.reimbursement.findUnique({
        where: { id: entityId },
        include: { items: { orderBy: { id: "asc" } } },
      });
      if (!reimbursement) return [];
      const usedTypes = reimbursement.items.map((i) => i.typeId);
      const usedCustomers = reimbursement.items.flatMap((i) => (i.customerId ? [i.customerId] : []));
      const usedProjects = reimbursement.items.flatMap((i) => (i.projectId ? [i.projectId] : []));
      const [types, customers, projects] = await Promise.all([
        db.reimburseType.findMany({
          where: { OR: [{ isActive: true, divisions: { has: reimbursement.division } }, { id: { in: usedTypes } }] },
          orderBy: { name: "asc" },
        }),
        db.customer.findMany({ where: { OR: [{ deletedAt: null }, { id: { in: usedCustomers } }] }, orderBy: { name: "asc" } }),
        db.project.findMany({ where: { OR: [{ isActive: true }, { id: { in: usedProjects } }] }, orderBy: { name: "asc" } }),
      ]);
      const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));
      const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
      const projectOptions: CorrectionOption[] = [
        { value: "", label: "Tanpa project" },
        { value: NEW_ACQUISITION, label: "New Acquisition (prospek)" },
        ...projects.map((p) => ({ value: p.id, label: projectLabel(p), parent: p.customerId })),
      ];
      return reimbursement.items.map((item, index) => ({
        targetId: item.id,
        label: `Baris ${index + 1}`,
        fields: [
          { key: "date", label: "Tanggal", kind: "date", value: isoOf(item.date) },
          { key: "customerId", label: "Company", kind: "select", value: item.customerId ?? "", options: customerOptions },
          {
            key: "project",
            label: "Project",
            kind: "select",
            value: item.newAcquisition ? NEW_ACQUISITION : (item.projectId ?? ""),
            options: projectOptions,
            dependsOn: "customerId",
            optional: true,
          },
          { key: "typeId", label: "Tipe", kind: "select", value: item.typeId, options: typeOptions },
          { key: "paymentMethod", label: "Payment", kind: "select", value: item.paymentMethod, options: PAYMENT_OPTIONS },
          { key: "amount", label: "Nominal", kind: "amount", value: Number(item.amount) },
          { key: "location", label: "Lokasi", kind: "text", value: item.location },
          { key: "activity", label: "Aktivitas", kind: "text", value: item.activity },
          { key: "participants", label: "Names – Position", kind: "textarea", value: item.participants },
          { key: "hasReceipt", label: "Ada kwitansi fisik", kind: "boolean", value: item.hasReceipt },
        ],
      }));
    }
    case "EXPENSE": {
      const e = await db.projectExpense.findUnique({ where: { id: entityId } });
      return e
        ? [
            {
              targetId: e.id,
              label: "Expense",
              fields: [
                { key: "date", label: "Tanggal", kind: "date", value: isoOf(e.date) },
                { key: "paymentMethod", label: "Payment", kind: "select", value: e.paymentMethod, options: PAYMENT_OPTIONS },
                { key: "amount", label: "Nominal", kind: "amount", value: Number(e.amount) },
                { key: "description", label: "Keterangan", kind: "text", value: e.description },
              ],
            },
          ]
        : [];
    }
    case "HEALTH": {
      const c = await db.healthClaim.findUnique({ where: { id: entityId } });
      return c ? [{ targetId: c.id, label: "Klaim", fields: [{ key: "note", label: "Keterangan", kind: "textarea", value: c.note ?? "" }] }] : [];
    }
    default:
      return [];
  }
}

/** Pastikan actor adalah approver step PENDING pengajuan ini. */
async function assertCurrentApprover(db: Db, requestId: string, actorId: string) {
  const request = await db.approvalRequest.findUnique({ where: { id: requestId }, include: { steps: true } });
  if (!request) throw new ServiceError("Pengajuan tidak ditemukan");
  if (request.status !== "PENDING") throw new ServiceError("Pengajuan ini sudah diproses");
  if (!(CORRECTABLE_MODULES as readonly ApprovalModule[]).includes(request.module)) throw new ServiceError("Pengajuan ini tidak bisa dikoreksi");
  const current = request.steps.find((s) => s.status === "PENDING");
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
  if (!current || !actor?.isActive || !canApprove(actor.role) || !current.approverIds.includes(actorId)) throw new ForbiddenError("Anda tidak berhak mengoreksi pengajuan ini");
  return { request, level: current.level };
}

/** Baris yang bisa dikoreksi (untuk dialog Koreksi di halaman Approval). */
export async function getCorrectionTargets(db: PrismaClient, requestId: string, actorId: string) {
  const { request } = await assertCurrentApprover(db, requestId, actorId);
  return loadTargets(db, request.module, request.entityId);
}

/** Nilai → teks untuk riwayat koreksi. */
function display(field: CorrectionField, value: CorrectionValue): string {
  if (value === null || value === "") return field.kind === "select" && field.key === "project" ? "Tanpa project" : "";
  switch (field.kind) {
    case "amount":
      return formatRupiah(Number(value));
    case "date":
      return formatDate(`${value}T00:00:00Z`, "short");
    case "boolean":
      return value ? "Ya" : "Tidak";
    case "select":
      return field.options?.find((o) => o.value === value)?.label ?? String(value);
    default:
      return String(value);
  }
}

/** Validasi & normalisasi satu nilai baru. `values` = nilai akhir target (untuk dependsOn). */
function normalize(target: CorrectionTarget, field: CorrectionField, raw: CorrectionValue, values: Record<string, CorrectionValue>): CorrectionValue {
  const where = `${target.label} · ${field.label}`;
  switch (field.kind) {
    case "amount": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) throw new ServiceError(`${where}: nominal harus lebih dari 0`);
      return n;
    }
    case "date": {
      const s = String(raw ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new ServiceError(`${where}: tanggal tidak valid`);
      if (s > toJakartaIsoDate()) throw new ServiceError(`${where}: tanggal tidak boleh di masa depan`);
      return s;
    }
    case "boolean":
      return Boolean(raw);
    case "select": {
      const s = String(raw ?? "");
      const parent = field.dependsOn ? String(values[field.dependsOn] ?? "") : undefined;
      const option = field.options?.find((o) => o.value === s);
      if (!option || (option.parent !== undefined && option.parent !== parent)) {
        throw new ServiceError(field.dependsOn && option ? `${where}: tidak sesuai ${field.dependsOn === "customerId" ? "company" : field.dependsOn} yang dipilih` : `${where}: pilihan tidak valid`);
      }
      return s;
    }
    default: {
      const s = String(raw ?? "").trim();
      if (s.length < 2) throw new ServiceError(`${where}: minimal 2 karakter`);
      if (s.length > 500) throw new ServiceError(`${where}: maksimal 500 karakter`);
      return s;
    }
  }
}

/** Kolom DB untuk nilai yang berubah, per modul. */
function toData(module: ApprovalModule, changed: Record<string, CorrectionValue>) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changed)) {
    if (key === "date") data[module === "HEALTH" ? "claimDate" : "date"] = fromIsoDate(String(value));
    else if (key === "amount") data.amount = BigInt(Number(value));
    else if (key === "project") {
      data.projectId = value && value !== NEW_ACQUISITION ? value : null;
      data.newAcquisition = value === NEW_ACQUISITION;
    } else if (key === "customerId") data.customerId = value || null;
    else data[key] = value;
  }
  return data;
}

export async function correctRequest(db: PrismaClient, actorId: string, requestId: string, changes: CorrectionChange[]) {
  return db.$transaction(async (tx) => {
    const { request, level } = await assertCurrentApprover(tx, requestId, actorId);
    const targets = new Map((await loadTargets(tx, request.module, request.entityId)).map((t) => [t.targetId, t]));
    const records: Prisma.ApprovalCorrectionCreateManyInput[] = [];

    for (const change of changes) {
      const target = targets.get(change.targetId);
      if (!target) throw new ServiceError("Baris yang dikoreksi tidak ditemukan");
      // Nilai akhir (lama + baru) dulu, supaya project dicek terhadap company yang baru.
      const finalValues = Object.fromEntries(target.fields.map((f) => [f.key, f.key in change.values ? change.values[f.key] : f.value]));
      // Company diganti tanpa memilih project baru → project lama (milik company lain) dikosongkan.
      const projectField = target.fields.find((f) => f.key === "project");
      const customerChanged = finalValues.customerId !== target.fields.find((f) => f.key === "customerId")?.value;
      if (projectField && customerChanged && finalValues.project === projectField.value) {
        const current = projectField.options?.find((o) => o.value === projectField.value);
        if (current?.parent !== undefined && current.parent !== finalValues.customerId) finalValues.project = "";
      }

      const changed: Record<string, CorrectionValue> = {};
      for (const field of target.fields) {
        if (finalValues[field.key] === field.value) continue;
        const next = normalize(target, field, finalValues[field.key], finalValues);
        if (next === field.value) continue;
        changed[field.key] = next;
        records.push({
          requestId,
          level,
          targetId: target.targetId,
          label: `${target.label} · ${field.label}`,
          field: field.key === "amount" ? "AMOUNT" : field.key.toUpperCase(),
          before: display(field, field.value),
          after: display(field, next),
          editedById: actorId,
        });
      }
      if (Object.keys(changed).length === 0) continue;

      const data = toData(request.module, changed);
      switch (request.module) {
        case "REIMBURSE":
          await tx.reimbursementItem.update({ where: { id: target.targetId }, data });
          break;
        case "EXPENSE":
          await tx.projectExpense.update({ where: { id: target.targetId }, data });
          break;
        case "HEALTH":
          await tx.healthClaim.update({ where: { id: target.targetId }, data });
          break;
      }
    }
    if (records.length === 0) throw new ServiceError("Tidak ada perubahan");

    // Total reimburse dihitung ulang dari baris (Tech Spec §6.4).
    if (request.module === "REIMBURSE") {
      const items = await tx.reimbursementItem.findMany({ where: { reimbursementId: request.entityId } });
      const { cash, cc, total } = reimbursementTotals(items.map((i) => ({ paymentMethod: i.paymentMethod, amount: Number(i.amount) })));
      await tx.reimbursement.update({ where: { id: request.entityId }, data: { totalCash: BigInt(cash), totalCc: BigInt(cc), total: BigInt(total) } });
    }
    await tx.approvalCorrection.createMany({ data: records });
    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "ApprovalRequest",
      entityId: requestId,
      after: { correction: records.map((r) => ({ label: r.label, field: r.field, before: r.before, after: r.after })) },
    });
    return records.length;
  });
}

export type CorrectionView = { id: string; label: string; field: string; before: string; after: string; editedBy: string; level: number; createdAt: string };

/** Riwayat koreksi & pembatalan approval per pengajuan (untuk pemohon & approver). */
export async function listCorrections(db: PrismaClient, requestIds: string[]): Promise<Map<string, CorrectionView[]>> {
  const rows = requestIds.length
    ? await db.approvalCorrection.findMany({
        where: { requestId: { in: requestIds } },
        orderBy: { createdAt: "asc" },
        include: { editedBy: { select: { email: true, employee: { select: { fullName: true } } } } },
      })
    : [];
  const map = new Map<string, CorrectionView[]>();
  for (const r of rows) {
    const list = map.get(r.requestId) ?? [];
    list.push({
      id: r.id,
      label: r.label,
      field: r.field,
      before: r.before,
      after: r.after,
      editedBy: r.editedBy.employee?.fullName ?? r.editedBy.email,
      level: r.level,
      createdAt: r.createdAt.toISOString(),
    });
    map.set(r.requestId, list);
  }
  return map;
}
