"use client";

import { RotateCcw, UserMinus } from "lucide-react";
import { DateActionDialog } from "@/components/employee/date-action-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { rehireEmployeeAction, resignEmployeeAction } from "./actions";

export function ResignButton({ employeeId, name }: { employeeId: string; name: string }) {
  return (
    <DateActionDialog
      trigger={
        <Button variant="destructive" size="lg">
          <UserMinus aria-hidden /> Resign
        </Button>
      }
      title={`Resign ${name}?`}
      description="Karyawan dipindahkan ke Arsip dan akunnya dinonaktifkan. Data tidak dihapus dan bisa diaktifkan kembali."
      dateLabel="Tanggal keluar"
      fieldName="endDate"
      confirmLabel="Resign"
      destructive
      action={(endDate) => resignEmployeeAction(employeeId, { endDate })}
    />
  );
}

export function RehireButton({
  employeeId,
  name,
  lastEndDate,
  size = "lg",
}: {
  employeeId: string;
  name: string;
  lastEndDate: string | null;
  size?: "lg" | "sm";
}) {
  return (
    <DateActionDialog
      trigger={
        <Button size={size}>
          <RotateCcw aria-hidden /> Aktifkan kembali
        </Button>
      }
      title={`Aktifkan kembali ${name}?`}
      description={
        <>
          Record lama dipakai lagi dengan periode kerja baru, dan akunnya diaktifkan kembali.
          {lastEndDate && ` Terakhir keluar ${formatDate(`${lastEndDate}T00:00:00Z`)}.`}
        </>
      }
      dateLabel="Tanggal masuk baru"
      fieldName="startDate"
      confirmLabel="Aktifkan kembali"
      action={(startDate) => rehireEmployeeAction(employeeId, { startDate })}
    />
  );
}
