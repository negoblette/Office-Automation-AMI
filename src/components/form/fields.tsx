"use client";

// Field form yang terhubung ke react-hook-form lewat `useFormContext` (bungkus form dengan
// `<FormProvider {...form}>`). Error diambil otomatis dari `formState.errors[name]`.
import { Controller, type FieldValues, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DateInput } from "./date-input";
import { fieldDescriptionId, FormField } from "./form-field";
import { type SelectOption, SelectField } from "./select-field";

type BaseFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
};

function useFieldState(name: string) {
  const { formState } = useFormContext<FieldValues>();
  // Nama bisa bersarang ("items.0.amount").
  const error = name.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], formState.errors) as
    | { message?: string }
    | undefined;
  return {
    error: error?.message,
    aria: {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": fieldDescriptionId(name),
    },
  };
}

export function TextInputField({
  name,
  label,
  required,
  hint,
  className,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<"input">, "name">) {
  const { register } = useFormContext<FieldValues>();
  const { error, aria } = useFieldState(name);
  return (
    <FormField label={label} htmlFor={name} required={required} hint={hint} error={error} className={className}>
      <Input id={name} className="h-10 bg-background" {...inputProps} {...aria} {...register(name)} />
    </FormField>
  );
}

export function TextareaField({
  name,
  label,
  required,
  hint,
  className,
  ...props
}: BaseFieldProps & Omit<React.ComponentProps<"textarea">, "name">) {
  const { register } = useFormContext<FieldValues>();
  const { error, aria } = useFieldState(name);
  return (
    <FormField label={label} htmlFor={name} required={required} hint={hint} error={error} className={className}>
      <Textarea id={name} className="min-h-20 bg-background" {...props} {...aria} {...register(name)} />
    </FormField>
  );
}

export function DateInputField({ name, label, required, hint, className, ...props }: BaseFieldProps & { max?: string; min?: string }) {
  const { register } = useFormContext<FieldValues>();
  const { error, aria } = useFieldState(name);
  return (
    <FormField label={label} htmlFor={name} required={required} hint={hint} error={error} className={className}>
      <DateInput id={name} {...props} {...aria} {...register(name)} />
    </FormField>
  );
}

export function SelectInputField({
  name,
  label,
  required,
  hint,
  className,
  options,
  placeholder,
  disabled,
}: BaseFieldProps & { options: SelectOption[]; placeholder?: string; disabled?: boolean }) {
  const { control } = useFormContext<FieldValues>();
  const { error, aria } = useFieldState(name);
  return (
    <FormField label={label} htmlFor={name} required={required} hint={hint} error={error} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <SelectField
            id={name}
            options={options}
            value={field.value || null}
            onChange={(value) => field.onChange(value ?? "")}
            placeholder={placeholder}
            disabled={disabled}
            {...aria}
          />
        )}
      />
    </FormField>
  );
}

/** Kartu pengelompok field form dengan judul, mis. "Data Diri". */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-card p-5 shadow-card sm:p-6", className)}>
      <div className="mb-5 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Nilai read-only di dalam FormSection (mis. divisi di Profil Saya). */
export function ReadOnlyField({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <p className="flex h-10 items-center rounded-lg bg-muted px-3 text-sm text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Checkbox tunggal (nilai boolean), mis. "Aktif". */
export function CheckboxField({
  name,
  label,
  hint,
  className,
  onCheckedChange,
}: Omit<BaseFieldProps, "required"> & { onCheckedChange?: (checked: boolean) => void }) {
  const { control } = useFormContext<FieldValues>();
  const { error } = useFieldState(name);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(event) => {
                field.onChange(event.target.checked);
                onCheckedChange?.(event.target.checked);
              }}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        )}
      />
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Beberapa checkbox untuk nilai array, mis. divisi yang boleh memakai tipe reimburse. */
export function CheckboxGroupField({ name, label, options, required, className }: BaseFieldProps & { options: SelectOption[] }) {
  const { control } = useFormContext<FieldValues>();
  const { error } = useFieldState(name);
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
        {required && <span className="text-danger"> *</span>}
      </legend>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const values: string[] = Array.isArray(field.value) ? field.value : [];
          return (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {options.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={values.includes(option.value)}
                    onChange={(event) =>
                      field.onChange(event.target.checked ? [...values, option.value] : values.filter((v) => v !== option.value))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          );
        }}
      />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
