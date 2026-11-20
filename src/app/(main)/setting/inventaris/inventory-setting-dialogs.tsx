"use client";

import { Hash, Loader2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckboxGroupField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import type { SelectOption } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { RACK_LIMITS } from "@/lib/inventory";
import type { RackView } from "@/lib/services/storage-rack";
import { trialFormCounterSchema } from "@/lib/validators/demo-loan";
import { operationalUsersSchema, rackSchema } from "@/lib/validators/inventory";
import { deleteRackAction, saveFormCounterAction, saveOperationalUsersAction, saveRackAction } from "./actions";

const FORM_NAME = { PTF: "Product Trial Form", HAF: "Hardware Admission Form" } as const;
const FORM_EXAMPLE = { PTF: "008/AMI-PTF/AMI/2026", HAF: "033/AMI-HAF/AMI/2026" } as const;

/** Nomor terakhir Product Trial Form / Hardware Admission Form tahun ini — form berikutnya memakai nomor ini + 1. */
export function FormCounterDialog({ kind, year, lastValue }: { kind: "PTF" | "HAF"; year: number; lastValue: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm" aria-label={`Atur nomor ${FORM_NAME[kind]}`}>
          <Hash aria-hidden /> Atur Nomor
        </Button>
      }
      title={`Nomor ${FORM_NAME[kind]}`}
      description={`Isi nomor form terakhir yang sudah dipakai di tahun ${year} (termasuk form manual sebelum memakai sistem). Form berikutnya memakai nomor ini + 1. Nomor kembali ke 001 setiap awal tahun.`}
      schema={trialFormCounterSchema}
      defaults={{ lastNumber: String(lastValue) as never }}
      submitLabel="Simpan"
      successMessage="Nomor form tersimpan"
      action={(values) => saveFormCounterAction(kind, values)}
    >
      <TextInputField
        name="lastNumber"
        label={`Nomor terakhir tahun ${year}`}
        required
        inputMode="numeric"
        hint={`Contoh: form terakhir ${FORM_EXAMPLE[kind]} → isi ${Number(FORM_EXAMPLE[kind].slice(0, 3))}`}
      />
    </FormDialog>
  );
}

/** Pilih user Operational (Admin). */
export function OperationalDialog({ selected, users }: { selected: string[]; users: SelectOption[] }) {
  return (
    <FormDialog
      wide
      trigger={
        <Button variant="outline" size="lg">
          <UsersRound aria-hidden /> Atur Operational
        </Button>
      }
      title="Atur Operational"
      description="Operational menyiapkan peminjaman yang sudah disetujui, mengecek barang yang kembali, menerima peringatan jatuh tempo, dan bisa mengelola unit & posisi rak. Boleh lebih dari satu orang, role apa pun."
      schema={operationalUsersSchema}
      defaults={{ userIds: selected }}
      submitLabel="Simpan"
      successMessage="Daftar Operational tersimpan"
      action={saveOperationalUsersAction}
    >
      <CheckboxGroupField name="userIds" label="User aktif" options={users} />
    </FormDialog>
  );
}

/** Tambah / ubah rak. */
export function RackDialog({ rack }: { rack?: RackView }) {
  return (
    <FormDialog
      trigger={
        rack ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${rack.name}`}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button size="lg">
            <Plus aria-hidden /> Tambah Rak
          </Button>
        )
      }
      title={rack ? `Ubah ${rack.name}` : "Tambah Rak"}
      description="Posisi di rak = huruf kolom + nomor baris, mis. A1. Rak 4 kolom × 5 baris berisi posisi A1 sampai D5."
      schema={rackSchema}
      defaults={{ name: rack?.name ?? "", columns: (rack?.columns ?? 4) as never, rows: (rack?.rows ?? 5) as never, note: rack?.note ?? "" }}
      submitLabel="Simpan"
      successMessage={rack ? "Rak tersimpan" : "Rak ditambahkan"}
      action={(values) => saveRackAction(rack?.id ?? null, values)}
    >
      <TextInputField name="name" label="Nama rak" required placeholder="mis. Rak 1" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          name="columns"
          label="Jumlah kolom"
          required
          inputMode="numeric"
          hint={`Huruf A sampai maksimal ${String.fromCharCode(64 + RACK_LIMITS.columns)} (${RACK_LIMITS.columns} kolom)`}
        />
        <TextInputField name="rows" label="Jumlah baris" required inputMode="numeric" hint={`Nomor 1 sampai maksimal ${RACK_LIMITS.rows}`} />
      </div>
      <TextareaField name="note" label="Catatan (opsional)" placeholder="mis. Gudang lantai 2, dekat pintu" />
    </FormDialog>
  );
}

/** Hapus rak — hanya rak kosong (dicek juga di server). */
export function DeleteRackButton({ rack }: { rack: RackView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  if (rack.assetCount > 0) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Hapus ${rack.name}`}
      onClick={async () => {
        const ok = await confirm({ title: `Hapus ${rack.name}?`, description: "Rak ini kosong. Bila ditambahkan lagi dengan nama yang sama, rak dipulihkan.", confirmLabel: "Hapus", tone: "danger" });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteRackAction(rack.id);
          if (result.ok) {
            notify(`${rack.name} dihapus`);
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
    </Button>
  );
}
