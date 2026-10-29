"use client";

import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type OtpInputProps = {
  /** Digit yang sudah diisi (0–`length` karakter angka). */
  value: string;
  onChange: (value: string) => void;
  /** Dipanggil sekali saat semua kotak terisi — mis. langsung kirim kode (2026-10-28). */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  /** Label untuk pembaca layar, mis. "Kode verifikasi". */
  label: string;
  id?: string;
};

/**
 * Kode angka per kotak (kode verifikasi MFA). Ketik → pindah ke kotak berikutnya, Backspace → kembali, tempel kode
 * 6 digit sekaligus juga bisa. `autocomplete="one-time-code"` di kotak pertama supaya HP bisa mengisi otomatis.
 */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled, autoFocus, invalid, label, id }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, length - 1)]?.focus();
    // Fokus hanya saat pertama tampil / setelah dikosongkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, value === ""]);

  const update = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    refs.current[Math.min(focusIndex, length - 1)]?.focus();
    if (clean.length === length && value.length !== length) onComplete?.(clean);
  };

  const onInput = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Beberapa digit sekaligus (isi otomatis / ketik cepat) → isi mulai kotak ini.
    const next = (value.slice(0, index) + typed).slice(0, length);
    update(next, next.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) update(value.slice(0, index) + value.slice(index + 1), index);
      else if (index > 0) update(value.slice(0, index - 1) + value.slice(index), index - 1);
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    update(pasted, pasted.length);
  };

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2" id={id}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          onChange={(event) => onInput(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={length}
          disabled={disabled}
          aria-label={`${label} digit ${index + 1}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "size-11 rounded-lg border border-input bg-background text-center font-mono text-xl font-semibold text-foreground outline-none transition-colors sm:size-12",
            "focus:border-primary focus:ring-3 focus:ring-primary/20 disabled:opacity-60",
            invalid && "border-danger",
          )}
        />
      ))}
    </div>
  );
}
