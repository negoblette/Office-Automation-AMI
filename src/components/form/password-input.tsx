"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Input password + tombol tampilkan/sembunyikan (audit UI 2026-10-27): pengguna bisa memeriksa ketikan
 * password panjang (minimal 15 karakter) sebelum menyimpan. Label tombol tetap, statusnya lewat `aria-pressed`.
 * Paste & password manager tetap bisa dipakai (`autoComplete` diteruskan).
 */
export function PasswordInput({ className, disabled, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input {...props} disabled={disabled} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        disabled={disabled}
        aria-label="Tampilkan password"
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-[14px] text-ink-3 transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon className="size-[18px]" aria-hidden />
      </button>
    </div>
  );
}
