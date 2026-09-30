"use client";

import { Pencil, Plus } from "lucide-react";
import { CheckboxField, CheckboxGroupField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { Button } from "@/components/ui/button";
import type { Division } from "@/generated/prisma/enums";
import { DIVISION_LABEL, toOptions } from "@/lib/labels";
import { healthCategorySchema, reimburseTypeSchema } from "@/lib/validators/project";
import { saveHealthCategoryAction, saveReimburseTypeAction } from "./actions";

function Trigger({ label, editing }: { label: string; editing: boolean }) {
  return editing ? (
    <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${label}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Plus aria-hidden /> {label}
    </Button>
  );
}

export function ReimburseTypeDialog({ type }: { type?: { id: string; name: string; divisions: Division[]; isActive: boolean } }) {
  return (
    <FormDialog
      trigger={<Trigger label={type?.name ?? "Tipe"} editing={Boolean(type)} />}
      title={type ? `Ubah ${type.name}` : "Tambah Tipe Reimburse"}
      schema={reimburseTypeSchema}
      defaults={{ name: type?.name ?? "", divisions: type?.divisions ?? [], isActive: type?.isActive ?? true }}
      submitLabel="Simpan"
      action={(values) => saveReimburseTypeAction(type?.id ?? null, values)}
    >
      <TextInputField name="name" label="Nama tipe" required />
      <CheckboxGroupField name="divisions" label="Boleh dipakai divisi" required options={toOptions(DIVISION_LABEL)} />
      <CheckboxField name="isActive" label="Aktif" hint="Tipe nonaktif tidak muncul di form reimburse baru." />
    </FormDialog>
  );
}

export function HealthCategoryDialog({ category }: { category?: { id: string; name: string; isActive: boolean } }) {
  return (
    <FormDialog
      trigger={<Trigger label={category?.name ?? "Kategori"} editing={Boolean(category)} />}
      title={category ? `Ubah ${category.name}` : "Tambah Kategori Klaim"}
      schema={healthCategorySchema}
      defaults={{ name: category?.name ?? "", isActive: category?.isActive ?? true }}
      submitLabel="Simpan"
      action={(values) => saveHealthCategoryAction(category?.id ?? null, values)}
    >
      <TextInputField name="name" label="Nama kategori" required />
      <CheckboxField name="isActive" label="Aktif" hint="Kategori nonaktif tidak muncul di form klaim baru." />
    </FormDialog>
  );
}
