"use client";

import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { DateInputField, SelectInputField, TextareaField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { AGENDA_MAX_LENGTH, type MeetingHours, slotOptions } from "@/lib/meeting-room";
import { meetingBookingSchema } from "@/lib/validators/meeting-room";
import { createMeetingBookingAction, updateMeetingBookingAction } from "./actions";

export type BookingFormValues = { roomId: string; date: string; start: string; end: string; agenda: string };

/** Jam mulai & selesai dari jam operasional; jam selesai hanya yang setelah jam mulai terpilih. */
function TimeFields({ hours }: { hours: MeetingHours }) {
  const { control } = useFormContext<BookingFormValues>();
  const start = useWatch({ control, name: "start" });
  const { starts, ends } = useMemo(() => slotOptions(hours), [hours]);
  const endOptions = ends.filter((time) => !start || time > start).map((time) => ({ value: time, label: time }));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectInputField name="start" label="Jam mulai" required options={starts.map((time) => ({ value: time, label: time }))} placeholder="Pilih jam" />
      <SelectInputField name="end" label="Jam selesai" required options={endOptions} placeholder="Pilih jam" />
    </div>
  );
}

/**
 * Dialog booking baru / ubah booking (Fase 17). Aturan hari & jam serta bentrok dicek di server; bila slot baru saja
 * diambil orang lain, pesan bentrok tampil di dialog dan kalender di belakangnya ikut diperbarui.
 */
export function BookingDialog({
  trigger,
  rooms,
  hours,
  minDate,
  maxDate,
  defaults,
  bookingId,
}: {
  trigger: React.ReactElement;
  rooms: { id: string; name: string }[];
  hours: MeetingHours;
  minDate: string;
  maxDate: string;
  defaults: BookingFormValues;
  /** Diisi = mode ubah (hanya satu kali per booking). */
  bookingId?: string;
}) {
  const editing = Boolean(bookingId);
  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Ubah Booking" : "Booking Ruang Meeting"}
      description={
        editing
          ? "Booking hanya bisa diubah SATU kali. Setelah disimpan, perubahan berikutnya harus lewat batal lalu booking ulang."
          : `Senin–Jumat, ${hours.start}–${hours.end}, kelipatan 30 menit, paling jauh 30 hari ke depan. Siapa cepat dia dapat.`
      }
      schema={meetingBookingSchema}
      defaults={defaults}
      submitLabel={editing ? "Simpan Perubahan" : "Booking"}
      successMessage={editing ? "Booking diubah. Email konfirmasi dikirim." : "Booking tersimpan. Email konfirmasi dikirim."}
      action={(values) => (bookingId ? updateMeetingBookingAction(bookingId, values) : createMeetingBookingAction(values))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInputField name="roomId" label="Ruang" required options={rooms.map((room) => ({ value: room.id, label: room.name }))} />
        <DateInputField name="date" label="Tanggal" required min={minDate} max={maxDate} />
      </div>
      <TimeFields hours={hours} />
      <TextareaField
        name="agenda"
        label="Agenda"
        required
        maxLength={AGENDA_MAX_LENGTH}
        placeholder="mis. Rapat mingguan tim Sales"
        hint="Tampil di kalender agar orang lain tahu ruang dipakai untuk apa."
      />
    </FormDialog>
  );
}
