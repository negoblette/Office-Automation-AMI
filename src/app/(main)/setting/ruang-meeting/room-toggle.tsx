"use client";

import { Loader2, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { setMeetingRoomActiveAction } from "../../ruang-meeting/actions";

/**
 * Nyalakan / matikan ruang meeting. Mematikan ruang yang masih punya booking aktif yang belum selesai ditolak server
 * (pesan tampil sebagai notifikasi).
 */
export function RoomToggle({ roomId, name, isActive }: { roomId: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  return (
    <Button
      variant={isActive ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm(
          isActive
            ? {
                title: `Nonaktifkan ${name}?`,
                description: "Ruang tidak bisa dibooking lagi sampai dinyalakan kembali. Riwayat booking tetap tersimpan.",
                confirmLabel: "Nonaktifkan",
                tone: "danger",
              }
            : { title: `Nyalakan ${name}?`, description: "Ruang langsung bisa dibooking semua karyawan.", confirmLabel: "Nyalakan" },
        );
        if (!ok) return;
        startTransition(async () => {
          const result = await setMeetingRoomActiveAction({ roomId, isActive: !isActive });
          if (result.ok) {
            notify(isActive ? `${name} dinonaktifkan` : `${name} sekarang bisa dibooking`);
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Power aria-hidden />}
      {isActive ? "Nonaktifkan" : "Nyalakan"}
    </Button>
  );
}
