"use client";

import { SlidersHorizontal } from "lucide-react";
import { TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { leaveAdjustmentSchema } from "@/lib/validators/leave";
import { adjustLeaveBalanceAction } from "../actions";

/** Pemutihan / penyesuaian saldo cuti satu karyawan (Fase 14). */
export function AdjustLeaveDialog({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Sesuaikan saldo ${employeeName}`}>
          <SlidersHorizontal />
        </Button>
      }
      title={`Sesuaikan saldo cuti ${employeeName}`}
      description="Pemutihan / koreksi saldo tahun berjalan. Isi angka positif untuk menambah (mis. mengembalikan cuti yang sudah terpotong) atau negatif untuk mengurangi. Tercatat di riwayat & audit."
      schema={leaveAdjustmentSchema}
      defaults={{ days: "" as never, reason: "" }}
      submitLabel="Simpan Penyesuaian"
      action={(values) => adjustLeaveBalanceAction(employeeId, values)}
    >
      <TextInputField name="days" label="Jumlah hari (+/−)" type="number" inputMode="numeric" required placeholder="mis. 2 atau -1" />
      <TextareaField name="reason" label="Alasan" required />
    </FormDialog>
  );
}
