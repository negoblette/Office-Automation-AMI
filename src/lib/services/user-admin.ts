// Setting → User & Role (Tahap 10.3): ubah role, aktif/nonaktif, reset password.
// Approver selalu Admin aktif (Tech Spec §4.2), jadi Admin yang dinonaktifkan / diturunkan ke
// Staf tidak boleh meninggalkan step approval tanpa approver lain.
import argon2 from "argon2";
import type { Prisma, PrismaClient, Role } from "@/generated/prisma/client";
import { APPROVAL_MODULE_META } from "@/lib/approval-modules";
import { DIVISION_LABEL } from "@/lib/labels";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export function flowLabel(flow: { module: keyof typeof APPROVAL_MODULE_META | null; division: keyof typeof DIVISION_LABEL | null; scope: string }) {
  if (flow.scope === "FALLBACK") return "Fallback";
  const moduleLabel = flow.module ? APPROVAL_MODULE_META[flow.module].label : "—";
  return `${moduleLabel} · ${flow.division ? DIVISION_LABEL[flow.division] : "Semua divisi"}`;
}

/**
 * Tolak jika user adalah SATU-SATUNYA approver aktif pada step flow aktif, atau pada step
 * pengajuan yang masih berjalan. Dipanggil sebelum user kehilangan hak approve.
 */
export async function assertCanLoseApproverRights(tx: Tx, userId: string, displayName: string) {
  const isOtherActiveAdmin = async (ids: string[]) =>
    (await tx.user.count({ where: { id: { in: ids.filter((id) => id !== userId) }, role: "ADMIN", isActive: true } })) > 0;

  const flowSteps = await tx.approvalFlowStep.findMany({
    where: { flow: { isActive: true, deletedAt: null }, approvers: { some: { userId } } },
    include: { flow: true, approvers: { select: { userId: true } } },
  });
  const blockingFlows: string[] = [];
  for (const step of flowSteps) {
    if (!(await isOtherActiveAdmin(step.approvers.map((a) => a.userId)))) blockingFlows.push(`${flowLabel(step.flow)} L${step.level}`);
  }
  if (blockingFlows.length) {
    throw new ServiceError(
      `${displayName} adalah satu-satunya approver di Approval Flow: ${blockingFlows.join(", ")}. Ubah Approval Flow terlebih dahulu.`,
    );
  }

  const pendingSteps = await tx.approvalRequestStep.findMany({
    where: { status: { in: ["PENDING", "WAITING"] }, approverIds: { has: userId }, request: { status: "PENDING" } },
    select: { approverIds: true },
  });
  let blockingRequests = 0;
  for (const step of pendingSteps) {
    if (!(await isOtherActiveAdmin(step.approverIds))) blockingRequests++;
  }
  if (blockingRequests) {
    throw new ServiceError(`Masih ada ${blockingRequests} pengajuan yang hanya bisa disetujui ${displayName}. Selesaikan dulu di halaman Approval.`);
  }
}

export type UserRow = {
  id: string;
  email: string;
  name: string;
  division: keyof typeof DIVISION_LABEL | null;
  position: string | null;
  employeeId: string | null;
  employeeStatus: "ACTIVE" | "RESIGNED" | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
};

export async function listUsers(db: PrismaClient): Promise<UserRow[]> {
  const users = await db.user.findMany({
    include: { employee: { select: { id: true, fullName: true, division: true, position: true, status: true } } },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.employee?.fullName ?? u.email,
    division: u.employee?.division ?? null,
    position: u.employee?.position ?? null,
    employeeId: u.employee?.id ?? null,
    employeeStatus: u.employee?.status ?? null,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
}

async function getUserOrThrow(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { employee: { select: { fullName: true, status: true } } } });
  if (!user) throw new ServiceError("User tidak ditemukan");
  return { ...user, displayName: user.employee?.fullName ?? user.email };
}

export async function setUserRole(db: PrismaClient, actorId: string, userId: string, role: Role) {
  return db.$transaction(async (tx) => {
    const user = await getUserOrThrow(tx, userId);
    if (user.id === actorId) throw new ServiceError("Anda tidak bisa mengubah role akun Anda sendiri");
    if (user.role === role) return;
    if (user.role === "ADMIN") await assertCanLoseApproverRights(tx, userId, user.displayName);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "User", entityId: userId, before: { role: user.role }, after: { role } });
  });
}

export async function setUserActive(db: PrismaClient, actorId: string, userId: string, isActive: boolean) {
  return db.$transaction(async (tx) => {
    const user = await getUserOrThrow(tx, userId);
    if (user.id === actorId) throw new ServiceError("Anda tidak bisa menonaktifkan akun Anda sendiri");
    if (user.isActive === isActive) return;
    if (isActive && user.employee?.status === "RESIGNED") {
      throw new ServiceError("Karyawan ini sudah resign. Aktifkan kembali lewat halaman Arsip (Rehire).");
    }
    if (!isActive && user.role === "ADMIN") await assertCanLoseApproverRights(tx, userId, user.displayName);
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "User", entityId: userId, before: { isActive: user.isActive }, after: { isActive } });
  });
}

/** Admin mengetik password baru (sama seperti saat membuat akun); password tidak masuk audit. */
export async function resetUserPassword(db: PrismaClient, actorId: string, userId: string, password: string) {
  const passwordHash = await argon2.hash(password);
  return db.$transaction(async (tx) => {
    await getUserOrThrow(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "User", entityId: userId, after: { passwordReset: true } });
  });
}
