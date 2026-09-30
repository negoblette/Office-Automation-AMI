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
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={fieldDescriptionId(htmlFor)} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={fieldDescriptionId(htmlFor)} className="text-xs text-muted-foreground">
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
