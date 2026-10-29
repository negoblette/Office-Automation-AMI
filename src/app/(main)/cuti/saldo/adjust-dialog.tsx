"use client";

import { SlidersHorizontal } from "lucide-react";
import { SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { toOptions } from "@/lib/labels";
import { LEAVE_ADJUST_MODES, leaveAdjustmentSchema } from "@/lib/validators/leave";
import { adjustLeaveBalanceAction } from "../actions";

/** Edit sisa cuti / pemutihan / penyesuaian saldo satu karyawan (Fase 14; "atur sisa" 2026-10-28). */
export function AdjustLeaveDialog({ employeeId, employeeName, remaining }: { employeeId: string; employeeName: string; remaining: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit sisa cuti ${employeeName}`} title="Edit sisa cuti">
          <SlidersHorizontal />
        </Button>
      }
      title={`Edit sisa cuti ${employeeName}`}
      description={`Sisa sekarang ${remaining} hari. "Atur sisa cuti menjadi" langsung mengganti angka sisa (boleh minus); "Tambah / kurangi" mengisi +/− hari. Selisihnya tercatat di riwayat & audit.`}
      schema={leaveAdjustmentSchema}
      defaults={{ mode: "SET", days: remaining as never, reason: "" }}
      submitLabel="Simpan"
      successMessage="Sisa cuti tersimpan"
      action={(values) => adjustLeaveBalanceAction(employeeId, values)}
    >
      <SelectInputField name="mode" label="Cara" required options={toOptions(LEAVE_ADJUST_MODES)} />
      <TextInputField name="days" label="Hari" type="number" inputMode="numeric" required placeholder="mis. 5, 2 atau -1" hint="Atur: sisa cuti yang benar. Tambah / kurangi: +2 atau -1." />
      <TextareaField name="reason" label="Alasan" required />
    </FormDialog>
  );
}
