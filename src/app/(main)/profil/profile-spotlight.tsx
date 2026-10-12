import { PersonAvatar } from "@/components/shared/person-cell";
import { Spotlight } from "@/components/shared/spotlight";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ProfileCompleteness } from "@/lib/employee-profile";
import { riseStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Sorotan Profil Saya: pemilik profil (kiri) + kelengkapan data diri, satu ruas per isian (kanan). */
export function ProfileSpotlight({
  name,
  position,
  email,
  roleLabel,
  completeness,
}: {
  name: string;
  position: string;
  email: string;
  roleLabel: string;
  completeness: ProfileCompleteness;
}) {
  return (
    <Spotlight
      label="Kelengkapan data diri"
      style={riseStyle(3)}
      className="grid items-center gap-x-8 gap-y-[22px] md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"
    >
      {/* Kiri: siapa pemilik profil */}
      <div className="flex min-w-0 items-center gap-[18px]">
        <PersonAvatar name={name} className="size-[68px] rounded-[22px] bg-brand-tint text-2xl" />
        <div className="flex min-w-0 flex-col">
          <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-ink">{name}</h2>
          <p className="text-sm text-ink-3">{position}</p>
          <p className="truncate text-[12.5px] text-ink-3">{email}</p>
          <StatusBadge className="mt-2 self-start">{roleLabel}</StatusBadge>
        </div>
      </div>

      {/* Kanan: kelengkapan, satu ruas per isian */}
      <div className="max-md:pt-[18px] max-md:shadow-[inset_0_1px_0_var(--line)] md:pl-8 md:shadow-[inset_1px_0_0_var(--line)]">
        <div className="flex flex-wrap items-end justify-between gap-x-7 gap-y-2.5">
          <span className="text-[13.5px] font-semibold text-ink-3">Kelengkapan Data Diri</span>
          <p className="text-[34px] leading-[1.08] font-extrabold tracking-[-0.04em] text-ink tabular-nums">{completeness.percent}%</p>
        </div>
        <div
          role="progressbar"
          aria-label="Kelengkapan data diri"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completeness.percent}
          className="my-2.5 flex gap-1"
        >
          {Array.from({ length: completeness.total }, (_, index) => (
            <span key={index} className={cn("h-2.5 flex-1 rounded-[4px]", index < completeness.filled ? "bg-brand" : "bg-rule")} />
          ))}
        </div>
        <p className="text-[13.5px] text-ink-3">
          {completeness.missing.length ? `Belum diisi: ${completeness.missing.join(", ")}.` : "Data diri Anda sudah lengkap."}
        </p>
      </div>
    </Spotlight>
  );
}
