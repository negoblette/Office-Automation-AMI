"use client";

import { Pencil } from "lucide-react";
import { TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import type { WorkHours } from "@/lib/attendance";
import { workHoursSchema } from "@/lib/validators/attendance";
import { saveWorkHoursAction } from "../../absensi/actions";

export function WorkHoursDialog({ hours }: { hours: WorkHours }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="lg">
          <Pencil aria-hidden /> Ubah
        </Button>
      }
      title="Ubah Jam Kerja"
      schema={workHoursSchema}
      defaults={hours}
      submitLabel="Simpan"
      action={saveWorkHoursAction}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="workStart" label="Jam masuk" type="time" required />
        <TextInputField name="workEnd" label="Jam pulang" type="time" required />
      </div>
    </FormDialog>
  );
}
