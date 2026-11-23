"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TextareaField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { adminCancelMeetingBookingSchema } from "@/lib/validators/meeting-room";
import { cancelMeetingBookingAction } from "./actions";

/**
 * Batalkan booking. Pemilik: konfirmasi saja. Admin atas booking milik orang lain: alasan wajib (dikirim ke pemilik
 * lewat email). Jam yang dibatalkan langsung bisa dibooking orang lain.
 */
export function CancelBookingButton({ bookingId, summary, needsReason }: { bookingId: string; summary: string; needsReason: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  const trigger = (
    <Button variant="ghost" size="sm" disabled={pending} aria-label={`Batalkan booking ${summary}`}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />} Batal
    </Button>
  );

  if (needsReason) {
    return (
      <FormDialog
        trigger={trigger}
        title="Batalkan Booking"
        description={`${summary}. Pemesan menerima email berisi alasan pembatalan.`}
        schema={adminCancelMeetingBookingSchema}
        defaults={{ reason: "" }}
        submitLabel="Batalkan Booking"
        successMessage="Booking dibatalkan"
        action={(values) => cancelMeetingBookingAction(bookingId, values)}
      >
        <TextareaField name="reason" label="Alasan pembatalan" required maxLength={300} placeholder="mis. Ruang dipakai rapat direksi" />
      </FormDialog>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Batalkan booking ${summary}`}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan booking ini?",
          description: `${summary}. Jam ini akan langsung bisa dibooking orang lain.`,
          confirmLabel: "Batalkan Booking",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelMeetingBookingAction(bookingId, {});
          if (result.ok) {
            notify("Booking dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />} Batal
    </Button>
  );
}
