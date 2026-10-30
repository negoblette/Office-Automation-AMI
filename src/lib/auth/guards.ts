import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "./index";
import { canApprove, mfaRequired } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  /** true = wajib ganti password dulu (akun baru / habis di-reset Admin). */
  mustChangePassword: boolean;
  /** true = role wajib MFA (semua role sejak 2026-10-30) tapi authenticator belum didaftarkan → wajib ke /mfa dulu (hardening Tahap 5). */
  mustSetupMfa: boolean;
  /** Super admin (2026-10-30): menyetujui semua pengajuan, membuka modul yang ditunda, tidak bisa diubah Admin lain. */
  isSuperAdmin: boolean;
};

/**
 * User yang sedang login, dibaca ulang dari database (bukan hanya dari token JWT),
 * supaya akun yang dinonaktifkan/di-resign, role yang diubah, atau password yang diganti
 * langsung berlaku. Di-cache per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      employeeId: true,
      sessionVersion: true,
      mustChangePassword: true,
      mfaSecret: true,
      isSuperAdmin: true,
      employee: { select: { fullName: true } },
    },
  });
  // Akun nonaktif, atau password sudah diganti/di-reset setelah token ini dibuat → sesi tidak berlaku.
  if (!user?.isActive || user.sessionVersion !== session.user.sessionVersion) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.employee?.fullName ?? user.email,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    mustSetupMfa: mfaRequired(user.role) && !user.mfaSecret,
    isSuperAdmin: user.role === "ADMIN" && user.isSuperAdmin,
  };
});

/**
 * Untuk route API (`/api/files`, export): user login yang sudah menyelesaikan langkah wajib (ganti password awal,
 * daftar MFA). Halaman memakai `requireUser` yang mengarahkan ke langkah tersebut.
 */
export async function getReadyUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword && !user.mustSetupMfa ? user : null;
}

/** Halaman tujuan untuk user yang baru login / masih punya langkah wajib. */
export function homePathFor(user: CurrentUser): string {
  if (user.mustChangePassword) return "/ganti-password";
  if (user.mustSetupMfa) return "/mfa";
  return "/dashboard";
}

/**
 * Wajib login. Dipakai di setiap page `(main)` dan Server Action. Akun yang wajib ganti
 * password diarahkan ke /ganti-password, kecuali halaman & aksi ganti password itu sendiri.
 * Setelah itu, user yang belum mendaftarkan MFA diarahkan ke /mfa (hardening Tahap 5; semua role sejak 2026-10-30).
 */
export async function requireUser({
  allowPasswordChange = false,
  allowMfaSetup = false,
}: { allowPasswordChange?: boolean; allowMfaSetup?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) {
    if (!allowPasswordChange) redirect("/ganti-password");
  } else if (user.mustSetupMfa && !allowMfaSetup) {
    redirect("/mfa");
  }
  return user;
}

/** Wajib role yang boleh menyetujui (ADMIN / APPROVER) — halaman & aksi Approval. */
export async function requireApprover(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canApprove(user.role)) redirect("/akses-ditolak");
  return user;
}

/** Wajib role ADMIN. Staf diarahkan ke halaman "Akses ditolak". */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/akses-ditolak");
  return user;
}
