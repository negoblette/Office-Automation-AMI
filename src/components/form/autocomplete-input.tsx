"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { INPUT_CLASS } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AutocompleteInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Saran yang bisa dipilih; isian lain tetap boleh diketik. */
  suggestions: readonly string[];
  placeholder?: string;
  /** Teks saat tidak ada saran yang cocok, mis. "Belum ada di data Customer — tetap bisa dipakai". */
  emptyText?: React.ReactNode;
  /** Ikon di depan tiap saran. */
  icon?: LucideIcon;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
};

/**
 * Isian teks dengan daftar saran (Base UI Autocomplete) bergaya sama dengan Select sistem: panel putih radius 16,
 * bayangan menu, baris tersorot abu, tanda ✓ untuk saran yang sama dengan isian. Pengguna bebas mengetik nilai yang
 * tidak ada di saran. Keyboard: ↑/↓ memilih, Enter mengisi, Esc menutup.
 */
export function AutocompleteInput({
  id,
  value,
  onChange,
  onBlur,
  inputRef,
  suggestions,
  placeholder,
  emptyText = "Tidak ada saran yang cocok",
  icon: Icon,
  ...aria
}: AutocompleteInputProps) {
  const current = value.trim().toLowerCase();
  return (
    <Autocomplete.Root items={suggestions} value={value} onValueChange={(next) => onChange(next)} openOnInputClick>
      <Autocomplete.InputGroup className="relative">
        <Autocomplete.Input
          id={id}
          ref={inputRef}
          placeholder={placeholder}
          autoComplete="off"
          onBlur={onBlur}
          className={cn(INPUT_CLASS, "pr-11")}
          {...aria}
        />
        <Autocomplete.Trigger
          aria-label="Tampilkan saran"
          className="absolute inset-y-1 right-1 flex w-9 cursor-pointer items-center justify-center rounded-[10px] text-ink-3 transition-colors duration-200 outline-none hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:outline-ink data-popup-open:text-ink [&[data-popup-open]>svg]:rotate-180"
        >
          <ChevronDown className="size-4 transition-transform duration-200" aria-hidden />
        </Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={6} className="isolate z-50 outline-none">
          <Autocomplete.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-[16px] bg-white p-1 text-ink shadow-(--elev-menu) transition-[opacity,transform] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Autocomplete.Empty className="px-3 py-2.5 text-[13px] text-ink-3 empty:hidden">{emptyText}</Autocomplete.Empty>
            <Autocomplete.List>
              {(item: string) => {
                const selected = item.toLowerCase() === current;
                return (
                  <Autocomplete.Item
                    key={item}
                    value={item}
                    className="flex min-h-10 cursor-default items-center gap-2.5 rounded-[10px] py-2 pr-2.5 pl-2.5 text-sm outline-none select-none data-highlighted:bg-panel"
                  >
                    {Icon && <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />}
                    <span className={cn("min-w-0 flex-1 wrap-anywhere", selected && "font-semibold")}>{item}</span>
                    {selected && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
                  </Autocomplete.Item>
                );
              }}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
