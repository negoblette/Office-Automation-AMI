"use client";

import { Pencil } from "lucide-react";
import { SelectInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import { minutesToTime, type MeetingHours, SLOT_MINUTES } from "@/lib/meeting-room";
import { meetingHoursSchema } from "@/lib/validators/meeting-room";
import { saveMeetingHoursAction } from "../../ruang-meeting/actions";

/** Pilihan jam 06:00–22:00 dalam kelipatan 30 menit (jam operasional harus sejajar dengan slot booking). */
const TIME_OPTIONS = Array.from({ length: (22 - 6) * (60 / SLOT_MINUTES) + 1 }, (_, i) => {
  const time = minutesToTime(6 * 60 + i * SLOT_MINUTES);
  return { value: time, label: time };
});

export function MeetingHoursDialog({ hours }: { hours: MeetingHours }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="lg">
          <Pencil aria-hidden /> Ubah
        </Button>
      }
      title="Ubah Jam Operasional Ruang Meeting"
      description="Berlaku untuk booking baru dan booking yang diubah. Booking yang sudah ada tidak berubah."
      schema={meetingHoursSchema}
      defaults={hours}
      submitLabel="Simpan"
      action={saveMeetingHoursAction}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInputField name="start" label="Jam buka" required options={TIME_OPTIONS} />
        <SelectInputField name="end" label="Jam tutup" required options={TIME_OPTIONS} />
      </div>
    </FormDialog>
  );
}
