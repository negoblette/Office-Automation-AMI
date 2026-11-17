"use client";

import { Loader2, PackageCheck, Pencil, Printer, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateInputField, SelectInputField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import type { SelectOption } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { toJakartaIsoDate } from "@/lib/format";
import { deliverDemoLoanSchema, itemSenderSchema } from "@/lib/validators/demo-loan";
import { cancelDemoLoanAction, markDeliveredAction, setItemSenderAction } from "./actions";

/** Buka Product Trial Form siap cetak (tab yang sama; tombol Kembali di halaman cetak). */
export function PrintFormLink({ loanId, primary }: { loanId: string; primary?: boolean }) {
  return (
    <Link href={`/cetak/peminjaman/${loanId}`} className={buttonVariants({ size: "lg", variant: primary ? "default" : "outline" })}>
      <Printer aria-hidden /> Cetak Form
    </Link>
  );
}

/** Operational / Admin: barang sudah diantar → status Dipinjam. Tanggal antar & nama penerima (Received By). */
export function DeliverDialog({ loanId, submittedAt }: { loanId: string; submittedAt: string }) {
  const today = toJakartaIsoDate();
  return (
    <FormDialog
      trigger={
        <Button size="lg">
          <PackageCheck aria-hidden /> Sudah Diantar
        </Button>
      }
      title="Barang sudah diantar"
      description="Status menjadi Dipinjam dan jatuh tempo mulai dipantau. Isi sesuai form yang ditandatangani penerima."
      schema={deliverDemoLoanSchema}
      defaults={{ deliveredAt: today, receivedByName: "" }}
      submitLabel="Simpan"
      successMessage="Peminjaman ditandai sudah diantar"
      action={(values) => markDeliveredAction(loanId, values)}
    >
      <DateInputField name="deliveredAt" label="Tanggal diantar" required min={toJakartaIsoDate(submittedAt)} max={today} />
      <TextInputField name="receivedByName" label="Nama penerima (Received By)" placeholder="mis. Muh Jawad Azzak" hint="Opsional. Sesuai nama di kolom Received By." />
    </FormDialog>
  );
}

/** Operational / Admin: pilih siapa yang mengantar barang (tercetak sebagai "Item Sender" di form). */
export function ItemSenderDialog({ loanId, senders, current }: { loanId: string; senders: SelectOption[]; current: string | null }) {
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant={current ? "outline" : "default"}>
          <Truck aria-hidden /> {current ? "Ganti Item Sender" : "Pilih Item Sender"}
        </Button>
      }
      title="Item Sender"
      description="Karyawan yang mengantar barang ke peminjam. Namanya tercetak di Product Trial Form untuk tanda tangan."
      schema={itemSenderSchema}
      defaults={{ itemSenderId: current ?? "" }}
      submitLabel="Simpan"
      successMessage="Item Sender tersimpan"
      action={(values) => setItemSenderAction(loanId, values)}
    >
      <SelectInputField name="itemSenderId" label="Item Sender (pengantar barang)" required options={senders} placeholder="Pilih karyawan…" />
    </FormDialog>
  );
}

/** Pemohon: ubah / revisi pengajuan yang belum disetujui. */
export function EditLoanLink({ loanId, rejected }: { loanId: string; rejected: boolean }) {
  return (
    <Link href={`/inventory/peminjaman/${loanId}/ubah`} className={buttonVariants({ size: "lg", variant: rejected ? "default" : "outline" })}>
      <Pencil aria-hidden /> {rejected ? "Revisi & Ajukan Ulang" : "Ubah"}
    </Link>
  );
}

/** Pemohon: batalkan pengajuan yang belum disetujui (unit langsung bebas, approval yang menunggu ditutup). */
export function CancelLoanButton({ loanId, borrowerName }: { loanId: string; borrowerName: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan pengajuan ini?",
          description: `Peminjaman ke ${borrowerName} dibatalkan, approval-nya dihentikan, dan unitnya bisa diajukan orang lain. Pengajuan yang dibatalkan tidak bisa diajukan ulang.`,
          confirmLabel: "Batalkan pengajuan",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelDemoLoanAction(loanId);
          if (result.ok) {
            notify("Pengajuan dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Batalkan
    </Button>
  );
}
