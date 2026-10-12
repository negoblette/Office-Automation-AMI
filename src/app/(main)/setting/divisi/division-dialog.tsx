"use client";

import { Pencil, Plus } from "lucide-react";
import { CheckboxField, SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { useDivisions } from "@/components/shared/divisions-context";
import { Button } from "@/components/ui/button";
import { divisionSchema } from "@/lib/validators/setting";
import { saveDivisionAction } from "./actions";

const NONE = "__none__";

/** Tambah / ubah divisi. "Alur approval mengikuti" = divisi acuan bila divisi ini belum punya alur sendiri. */
export function DivisionDialog({ division }: { division?: { code: string; name: string; followsCode: string | null; isActive: boolean } }) {
  const { options } = useDivisions();
  return (
    <FormDialog
      trigger={
        division ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${division.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Tambah Divisi
          </Button>
        )
      }
      title={division ? `Ubah ${division.name}` : "Tambah Divisi"}
      description="Divisi menentukan alur approval dan tipe reimburse yang bisa dipakai."
      schema={divisionSchema}
      defaults={{ name: division?.name ?? "", followsCode: division ? (division.followsCode ?? NONE) : "UMUM", isActive: division?.isActive ?? true }}
      submitLabel="Simpan"
      action={(values) => saveDivisionAction(division?.code ?? null, { ...values, followsCode: values.followsCode === NONE ? null : values.followsCode })}
    >
      <TextInputField name="name" label="Nama divisi" required placeholder="mis. Marketing" />
      <SelectInputField
        name="followsCode"
        label="Alur approval mengikuti"
        hint="Dipakai selama divisi ini belum punya alur sendiri di Setting → Approval Flow. Divisi baru juga mendapat tipe reimburse divisi ini."
        options={[{ value: NONE, label: "Tidak mengikuti (pakai alur semua divisi / Fallback)" }, ...options.filter((o) => o.value !== division?.code)]}
      />
      {division && <CheckboxField name="isActive" label="Divisi aktif" hint="Divisi nonaktif tidak muncul di pilihan. Tidak bisa dinonaktifkan selama masih ada karyawan aktif." />}
    </FormDialog>
  );
}
