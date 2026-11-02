// Query halaman Approval (/approval) & badge sidebar. Hasil aman dikirim ke Client Component.
import type { ApprovalModule, Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import type { ApprovalStepView } from "@/components/shared/approval-stepper";
import { CORRECTABLE_MODULES, type CorrectionView, listCorrections } from "./approval-correction";
import { APPEAL_REASON_LABEL, formatDuration } from "@/lib/attendance";
import { formatDate, formatTime } from "@/lib/format";
import { overtimeMinutes } from "@/lib/validators/overtime";
import { EDUCATION_LEVEL_LABEL, LEAVE_TYPE_LABEL, leaveDeductLabel, projectLabel } from "@/lib/labels";
import { canRevoke } from "./approval";
import { canActOnStep } from "@/lib/roles";
import { appealSummary } from "./attendance-appeal";
import { approverRoleLabel } from "@/components/shared/approval-status";

/** Super admin (2026-10-30) melihat & boleh memutuskan semua pengajuan yang menunggu, kecuali miliknya sendiri. */
async function isSuperAdmin(db: PrismaClient, userId: string) {
  return (await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }))?.isSuperAdmin ?? false;
}

/** Pengajuan yang menunggu keputusan user ini: step PENDING mencantumkan dia (super admin: semua). */
async function pendingQueueWhere(db: PrismaClient, userId: string): Promise<Prisma.ApprovalRequestWhereInput> {
  return (await isSuperAdmin(db, userId))
    ? { status: "PENDING", requesterId: { not: userId } }
    : { status: "PENDING", steps: { some: { status: "PENDING", approverIds: { has: userId } } } };
}

/** Jumlah pengajuan yang sedang menunggu persetujuan user ini (step PENDING). */
export async function countPendingApprovals(db: PrismaClient, userId: string): Promise<number> {
  return db.approvalRequest.count({ where: await pendingQueueWhere(db, userId) });
}

export type ApprovalRow = {
  id: string;
  module: ApprovalModule;
  entityId: string;
  entityNumber: string;
  status: RequestStatus;
  currentLevel: number | null;
  createdAt: string;
  completedAt: string | null;
  requesterName: string;
  requesterPosition: string | null;
  steps: ApprovalStepView[];
  /** true jika user yang login adalah approver step PENDING. */
  canApprove: boolean;
  /** HEALTH: nominal diajukan (dasar isian "nominal disetujui"); null untuk modul lain. */
  requestedAmount: number | null;
  /** LEAVE: hari dipotong dari saldo saat ini & jumlah hari kerja (dasar isian di dialog Setujui); null untuk modul lain. */
  leaveDeduct: { days: number; workingDays: number } | null;
  /** Reimburse overtime (2026-10-30): baris overtime yang nominalnya diisi approver di dialog Setujui; null = bukan. */
  overtimeLines: { itemId: string; label: string; amount: number | null }[] | null;
  /** User yang login boleh membatalkan persetujuan terakhir (approver yang menyetujui / Admin). */
  canRevoke: boolean;
  /** Bisa dikoreksi approver (modul dengan nominal/keterangan). */
  correctable: boolean;
  /** Riwayat koreksi approver (Fase 14). */
  corrections: CorrectionView[];
  /** Ringkasan singkat satu baris untuk tabel (2026-11-02); rincian lengkap di `summary` (tooltip & halaman detail). */
  headline: string | null;
  /** Rincian isi pengajuan untuk approver (mis. sertifikat yang diverifikasi, alasan appeal). */
  summary: string | null;
  /** File pendukung (mis. scan sertifikat) — approver boleh mengunduhnya. */
  file: { key: string; name: string } | null;
};

const include = {
  requester: { select: { email: true, employee: { select: { fullName: true, position: true } } } },
  steps: { orderBy: { level: "asc" as const } },
} satisfies Prisma.ApprovalRequestInclude;

type RequestWithSteps = Prisma.ApprovalRequestGetPayload<{ include: typeof include }>;

async function toRows(db: PrismaClient, requests: RequestWithSteps[], viewerId: string): Promise<ApprovalRow[]> {
  const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true, isSuperAdmin: true } });
  // Nama approver & pelaku untuk semua step sekaligus.
  const userIds = new Set(requests.flatMap((r) => r.steps.flatMap((s) => [...s.approverIds, ...(s.actedById ? [s.actedById] : [])])));
  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, email: true, role: true, employee: { select: { fullName: true } } },
  });
  const nameOf = new Map(users.map((user) => [user.id, user.employee?.fullName ?? user.email]));
  const roleOf = new Map(users.map((user) => [user.id, user.role]));
  const healthIds = requests.filter((r) => r.module === "HEALTH").map((r) => r.entityId);
  const claims = healthIds.length
    ? await db.healthClaim.findMany({ where: { id: { in: healthIds } }, select: { id: true, amount: true } })
    : [];
  const claimAmountOf = new Map(claims.map((c) => [c.id, Number(c.amount)]));
  const correctionsOf = await listCorrections(db, requests.map((r) => r.id));
  const certIds = requests.filter((r) => r.module === "CERTIFICATE").map((r) => r.entityId);
  const certificates = certIds.length
    ? await db.certificate.findMany({ where: { id: { in: certIds } }, include: { employee: { select: { fullName: true } } } })
    : [];
  const certOf = new Map(certificates.map((c) => [c.id, c]));
  const appealIds = requests.filter((r) => r.module === "ATTENDANCE_APPEAL").map((r) => r.entityId);
  const appeals = appealIds.length
    ? await db.attendanceAppeal.findMany({ where: { id: { in: appealIds } }, include: { employee: { select: { fullName: true } } } })
    : [];
  const appealOf = new Map(appeals.map((a) => [a.id, a]));
  const leaveIds = requests.filter((r) => r.module === "LEAVE").map((r) => r.entityId);
  const leaves = leaveIds.length ? await db.leaveRequest.findMany({ where: { id: { in: leaveIds } } }) : [];
  const leaveOf = new Map(leaves.map((l) => [l.id, l]));
  const reimburseIds = requests.filter((r) => r.module === "REIMBURSE").map((r) => r.entityId);
  const overtimeItems = reimburseIds.length
    ? await db.reimbursementItem.findMany({
        where: { reimbursementId: { in: reimburseIds }, overtimeId: { not: null } },
        orderBy: { id: "asc" },
        include: { overtime: { include: { customer: { select: { name: true } } } } },
      })
    : [];
  const overtimeLinesOf = new Map<string, NonNullable<ApprovalRow["overtimeLines"]>>();
  for (const item of overtimeItems) {
    const o = item.overtime!;
    const label = `${formatDate(o.date, "short")} · ${formatTime(o.clockIn)}–${o.clockOut ? formatTime(o.clockOut) : "…"} (${formatDuration(o.clockOut ? overtimeMinutes(o.clockIn, o.clockOut) : 0)}) · ${o.customer?.name ?? "—"}`;
    const lines = overtimeLinesOf.get(item.reimbursementId) ?? [];
    lines.push({ itemId: item.id, label, amount: item.amount > 0n ? Number(item.amount) : null });
    overtimeLinesOf.set(item.reimbursementId, lines);
  }
  const overtimeIds = requests.filter((r) => r.module === "OVERTIME").map((r) => r.entityId);
  const overtimes = overtimeIds.length
    ? await db.overtime.findMany({ where: { id: { in: overtimeIds } }, include: { customer: { select: { name: true } }, project: { select: { code: true, name: true } } } })
    : [];
  const overtimeOf = new Map(overtimes.map((o) => [o.id, o]));

  return requests.map((request) => ({
    id: request.id,
    module: request.module,
    entityId: request.entityId,
    entityNumber: request.entityNumber,
    status: request.status,
    currentLevel: request.currentLevel,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    requesterName: request.requester.employee?.fullName ?? request.requester.email,
    requesterPosition: request.requester.employee?.position ?? null,
    steps: request.steps.map((step) => ({
      level: step.level,
      approvers: step.approverIds.map((id) => nameOf.get(id) ?? "—"),
      approverLabel: approverRoleLabel(step.approverIds.map((id) => roleOf.get(id))),
      status: step.status,
      actedBy: step.actedById ? (nameOf.get(step.actedById) ?? null) : null,
      actedAt: step.actedAt?.toISOString() ?? null,
      note: step.status === "REJECTED" ? step.note : null,
    })),
    canApprove:
      request.status === "PENDING" &&
      request.steps.some((step) => step.status === "PENDING" && canActOnStep(viewer ?? { id: viewerId, isSuperAdmin: false }, step, request.requesterId)),
    canRevoke: viewer ? canRevoke(viewer, request) : false,
    requestedAmount: request.module === "HEALTH" ? (claimAmountOf.get(request.entityId) ?? null) : null,
    leaveDeduct: (() => {
      const leave = request.module === "LEAVE" ? leaveOf.get(request.entityId) : undefined;
      return leave ? { days: leave.deductDays, workingDays: leave.workingDays } : null;
    })(),
    overtimeLines: overtimeLinesOf.get(request.entityId) ?? null,
    correctable: (CORRECTABLE_MODULES as readonly ApprovalModule[]).includes(request.module),
    corrections: correctionsOf.get(request.id) ?? [],
    ...(() => {
      const appeal = appealOf.get(request.entityId);
      if (request.module === "ATTENDANCE_APPEAL" && appeal) {
        const when = appeal.endDate ? `${formatDate(appeal.date, "short")} – ${formatDate(appeal.endDate, "short")}` : formatDate(appeal.date, "short");
        return {
          headline: `${APPEAL_REASON_LABEL[appeal.reason]} · ${when}`,
          summary: appealSummary(appeal),
          file: appeal.fileKey ? { key: appeal.fileKey, name: appeal.fileName ?? "Surat sakit" } : null,
        };
      }
      const overtime = overtimeOf.get(request.entityId);
      if (request.module === "OVERTIME" && overtime) {
        const parts = [
          `${formatDate(overtime.date, "short")} ${formatTime(overtime.clockIn)}–${overtime.clockOut ? formatTime(overtime.clockOut) : "…"}`,
          overtime.clockOut && formatDuration(overtimeMinutes(overtime.clockIn, overtime.clockOut)),
          [overtime.customer?.name, overtime.project && projectLabel(overtime.project)].filter(Boolean).join(" · "),
          overtime.activity,
        ];
        return { headline: parts.slice(0, 2).filter(Boolean).join(" · "), summary: parts.filter(Boolean).join(" · "), file: null };
      }
      const otLines = overtimeLinesOf.get(request.entityId);
      if (otLines) {
        return { headline: `Reimburse overtime · ${otLines.length} sesi`, summary: `Reimburse overtime · ${otLines.length} sesi — isi nominal tiap sesi saat menyetujui`, file: null };
      }
      const leave = leaveOf.get(request.entityId);
      if (request.module === "LEAVE" && leave) {
        const start = formatDate(leave.startDate, "short");
        const end = formatDate(leave.endDate, "short");
        const parts = [
          LEAVE_TYPE_LABEL[leave.type],
          `${start === end ? start : `${start} – ${end}`} (${leave.workingDays} hari kerja)`,
          leaveDeductLabel(leave.deductDays, leave.workingDays),
        ];
        return { headline: parts.slice(0, 2).join(" · "), summary: parts.join(" · "), file: null };
      }
      const c = certOf.get(request.entityId);
      if (request.module !== "CERTIFICATE" || !c) return { headline: null, summary: null, file: null };
      const parts = [
        `${c.name} (${c.employee.fullName})`,
        c.issuer && `Penerbit ${c.issuer}`,
        c.level && `Level ${c.level}`,
        c.degree && `Jenjang ${EDUCATION_LEVEL_LABEL[c.degree]}`,
        c.number && !c.level && !c.degree && `No. ${c.number}`,
        c.type === "IJAZAH" ? `Lulus ${formatDate(c.graduationDate ?? c.startDate, "short")}` : `Diambil ${formatDate(c.startDate, "short")}`,
        c.type === "IJAZAH"
          ? null
          : c.endDate
            ? `Berlaku s/d ${formatDate(c.endDate, "short")}`
            : "Permanen",
      ];
      return { headline: c.name, summary: parts.filter(Boolean).join(" · "), file: c.fileKey ? { key: c.fileKey, name: c.name } : null };
    })(),
  }));
}

/**
 * Satu pengajuan untuk halaman detail `/approval/[id]` (2026-11-02). Admin: semua; Approver: hanya yang mencantumkan dia
 * di salah satu level (atau yang bisa ia putuskan sebagai super admin). null = tidak ada / tidak berhak.
 */
export async function getApprovalDetail(db: PrismaClient, requestId: string, viewer: { id: string; role: string }): Promise<ApprovalRow | null> {
  const request = await db.approvalRequest.findUnique({ where: { id: requestId }, include });
  if (!request) return null;
  const involved = request.steps.some((step) => step.approverIds.includes(viewer.id) || step.actedById === viewer.id);
  if (viewer.role !== "ADMIN" && !involved) return null;
  const [row] = await toRows(db, [request], viewer.id);
  return row;
}

/** Antrian milik user yang login: pengajuan dengan step PENDING yang mencantumkan dia (super admin: semua). */
export async function listMyApprovalQueue(db: PrismaClient, userId: string): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: await pendingQueueWhere(db, userId),
    orderBy: { createdAt: "asc" },
    include,
  });
  return toRows(db, requests, userId);
}

/**
 * Monitor pengajuan (terbaru dulu). Admin: semua; Approver (`onlyInvolving`): hanya pengajuan yang
 * mencantumkan dia sebagai approver di salah satu level.
 */
export async function listAllApprovals(db: PrismaClient, viewerId: string, limit = 500, onlyInvolving = false): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: onlyInvolving ? { steps: { some: { approverIds: { has: viewerId } } } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include,
  });
  return toRows(db, requests, viewerId);
}

/** Pengajuan milik user (terbaru dulu) — dashboard Staf. */
export async function listMyRequests(db: PrismaClient, userId: string, limit = 8): Promise<ApprovalRow[]> {
  const requests = await db.approvalRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include,
  });
  return toRows(db, requests, userId);
}
