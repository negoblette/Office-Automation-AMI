"use client";

import { KeyRound, Loader2, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, dataTableColumnHelper } from "@/components/table/data-table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { DIVISION_LABEL, ROLE_LABEL, toOptions } from "@/lib/labels";
import type { UserRow } from "@/lib/services/user-admin";
import { resetPasswordSchema, userRoleSchema } from "@/lib/validators/setting";
import { resetPasswordAction, setUserActiveAction, setUserRoleAction } from "./actions";

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
      action={(values) => resetPasswordAction(user.id, values)}
    >
      <TextInputField name="password" label="Password baru" type="password" autoComplete="new-password" required hint="Minimal 8 karakter." />
    </FormDialog>
  );
}

function ActiveToggle({ user }: { user: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={user.isActive ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() => {
          const verb = user.isActive ? "Nonaktifkan" : "Aktifkan";
          if (!window.confirm(`${verb} akun ${user.name}?`)) return;
          setError(null);
          startTransition(async () => {
            const result = await setUserActiveAction(user.id, !user.isActive);
            if (result.ok) router.refresh();
            else setError(result.error);
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
    col.accessor((row) => (row.division ? DIVISION_LABEL[row.division] : "—"), { id: "division", header: "Divisi" }),
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
            {row.original.employeeStatus !== "RESIGNED" && <ActiveToggle user={row.original} />}
          </div>
        ),
    }),
  ]);
}
