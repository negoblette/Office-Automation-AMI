import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  /** Harus sama dengan `id` input di dalamnya. */
  htmlFor: string;
  /** Pesan error dari react-hook-form (`errors.x?.message`). */
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label + input + hint/error. Untuk aksesibilitas, beri input `id={htmlFor}`,
 * `aria-invalid={!!error}`, dan `aria-describedby={fieldDescriptionId(htmlFor)}`.
 */
export function FormField({ label, htmlFor, error, hint, required, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-[7px]", className)}>
      <Label htmlFor={htmlFor} className="gap-1 text-[13px] leading-snug font-bold text-ink-2">
        {label}
        {required && (
          <span className="text-red-ink" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={fieldDescriptionId(htmlFor)} className="text-[12.5px] font-semibold text-red-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={fieldDescriptionId(htmlFor)} className="text-[12.5px] text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function fieldDescriptionId(htmlFor: string) {
  return `${htmlFor}-description`;
}
