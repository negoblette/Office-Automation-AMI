"use client";

import { CalendarPlus, ClipboardCheck, FileCheckCorner, Loader2, PackageCheck, Pencil, Printer, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import type { SelectOption } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { addDaysIso, addMonthsIso, maxLoanEnd } from "@/lib/demo-loan";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { deliverDemoLoanSchema, demoLoanExtensionSchema, itemSenderSchema } from "@/lib/validators/demo-loan";
import { cancelDemoLoanAction, cancelLoanExtensionAction, markDeliveredAction, requestLoanExtensionAction, setItemSenderAction } from "./actions";

/** Buka Product Trial Form siap cetak (tab yang sama; tombol Kembali di halaman cetak). */
export function PrintFormLink({ loanId, primary }: { loanId: string; primary?: boolean }) {
  return (
    <Link href={`/cetak/peminjaman/${loanId}`} className={buttonVariants({ size: "lg", variant: primary ? "default" : "outline" })}>
      <Printer aria-hidden /> Cetak Form
    </Link>
  );
}

/** Operational / Admin: barang sudah kembali → halaman cek unit & taruh kembali di rak (Tahap 16.5). */
export function ReturnLoanLink({ loanId }: { loanId: string }) {
  return (
    <Link href={`/inventory/peminjaman/${loanId}/kembali`} className={buttonVariants({ size: "lg" })}>
      <ClipboardCheck aria-hidden /> Terima Pengembalian
    </Link>
  );
}

/** Hardware Admission Form siap cetak — terbit setelah pengembalian dicatat. */
export function PrintHafLink({ loanId, primary }: { loanId: string; primary?: boolean }) {
  return (
    <Link href={`/cetak/peminjaman/${loanId}/haf`} className={buttonVariants({ size: "lg", variant: primary ? "default" : "outline" })}>
      <FileCheckCorner aria-hidden /> Cetak HAF
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

/**
 * Ajukan perpanjangan jatuh tempo (Tahap 16.4): pemohon / Operational / Admin, selama barang masih dipinjam. Tanggal
 * selesai baru: setelah jatuh tempo sekarang, tidak sebelum hari ini, maks. 2 tahun sejak mulai (dicek ulang di server).
 */
export function ExtendLoanDialog({ loanId, startDate, dueDate }: { loanId: string; startDate: string; dueDate: string }) {
  const { notify } = useFeedback();
  const today = toJakartaIsoDate();
  const earliest = [addDaysIso(dueDate, 1), today].sort().at(-1)!;
  const latest = maxLoanEnd(startDate);
  // Usulan: 1 bulan setelah jatuh tempo (atau setelah hari ini bila sudah lama terlambat), dijepit batas 2 tahun.
  const suggested = [addMonthsIso(addDaysIso(earliest, -1), 1), latest].sort()[0];
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant="outline">
          <CalendarPlus aria-hidden /> Ajukan Perpanjangan
        </Button>
      }
      title="Ajukan perpanjangan"
      description={`Jatuh tempo sekarang ${formatDate(`${dueDate}T00:00:00Z`, "short")}. Perpanjangan perlu disetujui approver Peminjaman Unit (Approval Flow); selama menunggu, jatuh tempo belum berubah.`}
      schema={demoLoanExtensionSchema}
      defaults={{ newDueDate: suggested, reason: "" }}
      submitLabel="Ajukan"
      successMessage={null}
      onSuccess={(data: { approved: boolean }) =>
        notify(data.approved ? "Perpanjangan disetujui — jatuh tempo sudah diperbarui" : "Perpanjangan diajukan, menunggu approval")
      }
      action={(values) => requestLoanExtensionAction(loanId, values)}
    >
      <DateInputField name="newDueDate" label="Tanggal selesai baru (jatuh tempo)" required min={earliest} max={latest} hint="Hari terakhir barang dipinjam. Maksimal 2 tahun sejak tanggal mulai." />
      <TextareaField name="reason" label="Alasan perpanjangan" required rows={3} maxLength={500} placeholder="mis. POC diperpanjang customer sampai akhir bulan" />
    </FormDialog>
  );
}

/** Yang mengajukan: batalkan perpanjangan yang belum diputuskan. */
export function CancelExtensionButton({ extensionId }: { extensionId: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan perpanjangan ini?",
          description: "Pengajuan perpanjangan dihentikan dan jatuh tempo tetap seperti sekarang. Anda bisa mengajukan perpanjangan baru.",
          confirmLabel: "Batalkan perpanjangan",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelLoanExtensionAction(extensionId);
          if (result.ok) {
            notify("Perpanjangan dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Batalkan perpanjangan
    </Button>
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
