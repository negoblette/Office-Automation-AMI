"use client";

import { KeyRound, Loader2, LockOpen, ShieldOff, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { useFeedback } from "@/components/shared/feedback";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL, toOptions } from "@/lib/labels";
import { mfaRequired } from "@/lib/roles";
import type { UserRow } from "@/lib/services/user-admin";
import { resetPasswordSchema, userRoleSchema } from "@/lib/validators/setting";
import { resetMfaAction, resetPasswordAction, setUserActiveAction, setUserRoleAction, unlockLoginAction } from "./actions";
import { DivisionName } from "@/components/shared/division-name";

function RoleDialog({ user }: { user: UserRow }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Ubah role ${user.name}`}>
          <UserCog />
        </Button>
      }
      title={`Ubah role ${user.name}`}
      description="Admin melihat & mengelola semua data. Admin yang menjadi approver tidak bisa diturunkan sebelum Approval Flow diubah."
      schema={userRoleSchema}
      defaults={{ role: user.role }}
      submitLabel="Simpan"
      action={(values) => setUserRoleAction(user.id, values)}
    >
      <SelectInputField name="role" label="Role" required options={toOptions(ROLE_LABEL)} />
    </FormDialog>
  );
}

function PasswordDialog({ user }: { user: UserRow }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Reset password ${user.name}`}>
          <KeyRound />
        </Button>
      }
      title={`Reset password ${user.name}`}
      description={`Password baru untuk login ${user.email}. Berikan ke yang bersangkutan.`}
      schema={resetPasswordSchema}
      defaults={{ password: "" }}
      submitLabel="Reset Password"
      successMessage={`Password ${user.name} direset`}
      action={(values) => resetPasswordAction(user.id, values)}
    >
      <TextInputField name="password" label="Password baru" type="password" autoComplete="new-password" required hint="Minimal 15 karakter. User wajib menggantinya saat login berikutnya, dan semua sesinya berakhir." />
    </FormDialog>
  );
}

/** Reset MFA (hardening Tahap 5): HP hilang & kode cadangan habis. User wajib mendaftar ulang saat login berikutnya. */
function ResetMfaButton({ user }: { user: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, notify } = useFeedback();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Reset MFA ${user.name}`}
        title="Reset MFA"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Reset MFA ${user.name}?`,
            description: "Semua sesinya berakhir dan ia wajib mendaftarkan aplikasi authenticator lagi saat login. Tercatat di audit.",
            confirmLabel: "Reset MFA",
            tone: "danger",
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await resetMfaAction(user.id);
            if (result.ok) {
              notify(`MFA ${user.name} direset`);
              router.refresh();
            } else setError(result.error);
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldOff />}
      </Button>
      {error && (
        <p role="alert" className="max-w-64 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Buka blokir login (hardening Tahap 6): percobaan gagal sebelumnya tidak dihitung lagi; tercatat di audit. */
function UnlockLoginButton({ user }: { user: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, notify } = useFeedback();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Buka blokir login ${user.name}`}
        title="Buka blokir login"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Buka blokir login ${user.name}?`,
            description: "Pastikan percobaan gagal tadi memang dari pemilik akun. Tercatat di audit.",
            confirmLabel: "Buka blokir",
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await unlockLoginAction(user.id);
            if (result.ok) {
              notify(`Blokir login ${user.name} dibuka`);
              router.refresh();
            } else setError(result.error);
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LockOpen />}
      </Button>
      {error && (
        <p role="alert" className="max-w-64 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ActiveToggle({ user }: { user: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, notify } = useFeedback();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={user.isActive ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={async () => {
          const verb = user.isActive ? "Nonaktifkan" : "Aktifkan";
          const ok = await confirm({
            title: `${verb} akun ${user.name}?`,
            description: user.isActive ? "User tidak bisa login sampai akunnya diaktifkan lagi." : undefined,
            confirmLabel: verb,
            tone: user.isActive ? "danger" : "default",
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await setUserActiveAction(user.id, !user.isActive);
            if (result.ok) {
              notify(`Akun ${user.name} ${user.isActive ? "dinonaktifkan" : "diaktifkan"}`);
              router.refresh();
            } else setError(result.error);
          });
        }}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {user.isActive ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {error && (
        <p role="alert" className="max-w-64 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const col = dataTableColumnHelper<UserRow>();

export function UserTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const columns = useMemo(() => buildColumns(currentUserId), [currentUserId]);
  return <DataTable columns={columns} data={rows} getRowId={(row) => row.id} searchPlaceholder="Cari nama atau email…" rowNoun="user" emptyMessage="Belum ada user." />;
}

function buildColumns(currentUserId: string) {
  return col.columns([
    col.accessor((row) => `${row.name} ${row.email}`, {
      id: "user",
      header: "User",
      sortFn: (a, b) => a.original.name.localeCompare(b.original.name, "id"),
      cell: ({ row }) => {
        const person = <PersonCell name={row.original.name} subtitle={row.original.email} />;
        return row.original.employeeId ? (
          <Link href={`/karyawan/${row.original.employeeId}`} className="block hover:underline">
            {person}
          </Link>
        ) : (
          person
        );
      },
    }),
    col.accessor((row) => row.division ?? "", { id: "division", header: "Divisi", cell: ({ row }) => <DivisionName code={row.original.division} /> }),
    col.accessor((row) => ROLE_LABEL[row.role], {
      id: "role",
      header: "Role",
      cell: ({ row }) => <StatusBadge variant={row.original.role === "ADMIN" ? "info" : "neutral"} dot={false}>{ROLE_LABEL[row.original.role]}</StatusBadge>,
    }),
    col.accessor((row) => (row.isActive ? "Aktif" : "Nonaktif"), {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge variant={row.original.isActive ? "success" : "neutral"}>{row.original.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
          {row.original.employeeStatus === "RESIGNED" && <StatusBadge variant="warning" dot={false}>Resign</StatusBadge>}
          {row.original.loginLocked && <StatusBadge variant="danger" dot={false}>Diblokir</StatusBadge>}
          {row.original.mfaEnabled ? (
            <StatusBadge variant="info" dot={false}>MFA</StatusBadge>
          ) : (
            mfaRequired(row.original.role) && row.original.isActive && <StatusBadge variant="warning" dot={false}>MFA belum</StatusBadge>
          )}
        </div>
      ),
    }),
    col.accessor("lastLoginAt", {
      header: "Login terakhir",
      enableGlobalFilter: false,
      cell: ({ getValue }) => {
        const value = getValue();
        return value ? formatDateTime(value) : <span className="text-muted-foreground">Belum pernah</span>;
      },
    }),
    col.display({
      id: "actions",
      header: "Aksi",
      cell: ({ row }) =>
        row.original.id === currentUserId ? (
          <div className="flex items-center gap-1">
            <PasswordDialog user={row.original} />
            <span className="text-xs text-muted-foreground">Akun Anda</span>
          </div>
        ) : (
          <div className="flex items-start gap-1">
            <RoleDialog user={row.original} />
            <PasswordDialog user={row.original} />
            {row.original.mfaEnabled && <ResetMfaButton user={row.original} />}
            {row.original.loginLocked && <UnlockLoginButton user={row.original} />}
            {row.original.employeeStatus !== "RESIGNED" && <ActiveToggle user={row.original} />}
          </div>
        ),
    }),
  ]);
}
