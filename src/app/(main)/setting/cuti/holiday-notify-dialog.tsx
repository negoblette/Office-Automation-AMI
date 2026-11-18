"use client";

import { BellRing } from "lucide-react";
import { CheckboxGroupField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import type { SelectOption } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { holidayNotifyUsersSchema } from "@/lib/validators/leave";
import { saveHolidayNotifyUsersAction } from "./actions";

/** Admin: pilih siapa yang diberi tahu saat kalender libur berubah (2026-11-18; HR & Direktur yang menangani cuti). */
export function HolidayNotifyDialog({ selected, users }: { selected: string[]; users: SelectOption[] }) {
  return (
    <FormDialog
      wide
      trigger={
        <Button variant="outline" size="lg">
          <BellRing aria-hidden /> Atur Penerima
        </Button>
      }
      title="Penerima notifikasi perubahan libur"
      description="Diberi tahu lewat email & lonceng setiap kali sinkronisasi menambah, memindah, atau menghapus libur nasional, beserta pengajuan cuti yang hari kerjanya ikut berubah. Kosongkan untuk mengirim ke semua Admin."
      schema={holidayNotifyUsersSchema}
      defaults={{ userIds: selected }}
      submitLabel="Simpan"
      successMessage="Penerima notifikasi tersimpan"
      action={saveHolidayNotifyUsersAction}
    >
      <CheckboxGroupField name="userIds" label="User aktif" options={users} />
    </FormDialog>
  );
}
