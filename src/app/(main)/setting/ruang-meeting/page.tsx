import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getMeetingHours } from "@/lib/services/meeting-room";
import { countUpcomingBookingsByRoom, listMeetingRooms } from "@/lib/services/meeting-room-queries";
import { MeetingHoursDialog } from "./meeting-hours-dialog";
import { RoomToggle } from "./room-toggle";

export const metadata: Metadata = { title: "Ruang Meeting" };

/** Setting ruang meeting (Fase 17, 2026-11-23): jam operasional booking & saklar aktif tiap ruang. */
export default async function SettingRuangMeetingPage() {
  await requireAdmin();
  const [hours, rooms, upcoming] = await Promise.all([getMeetingHours(prisma), listMeetingRooms(prisma), countUpcomingBookingsByRoom(prisma)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ruang Meeting"
        description="Jam operasional booking dan ruang yang sedang beroperasi. Booking tidak memerlukan approval."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Ruang Meeting" }]}
      />

      <section className="flex max-w-xl flex-col gap-3" aria-labelledby="jam-operasional">
        <h2 id="jam-operasional" className="text-base font-semibold">
          Jam operasional
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <dl className="grid grid-cols-2 gap-6">
            <div>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Jam buka</dt>
              <dd className="text-2xl font-bold tabular-nums">{hours.start}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Jam tutup</dt>
              <dd className="text-2xl font-bold tabular-nums">{hours.end}</dd>
            </div>
          </dl>
          <MeetingHoursDialog hours={hours} />
        </div>
        <p className="text-sm text-muted-foreground">
          Booking hanya Senin–Jumat (bukan tanggal di Kalender Libur), kelipatan 30 menit, paling jauh 30 hari ke depan. Perubahan jam
          berlaku untuk booking baru; booking yang sudah ada tidak berubah.
        </p>
      </section>

      <section className="flex max-w-xl flex-col gap-3" aria-labelledby="daftar-ruang">
        <h2 id="daftar-ruang" className="text-base font-semibold">
          Ruang
        </h2>
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => {
            const count = upcoming.get(room.id) ?? 0;
            return (
              <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-5 py-4 shadow-card">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {room.name}
                    <StatusBadge variant={room.isActive ? "success" : "neutral"}>{room.isActive ? "Beroperasi" : "Tidak beroperasi"}</StatusBadge>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {count ? `${count} booking belum selesai — ruang belum bisa dinonaktifkan` : "Tidak ada booking yang belum selesai"}
                  </p>
                </div>
                <RoomToggle roomId={room.id} name={room.name} isActive={room.isActive} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
