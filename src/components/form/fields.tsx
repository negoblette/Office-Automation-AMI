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
      <Input id={name} {...inputProps} {...aria} {...register(name)} />
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
      <Textarea id={name} {...props} {...aria} {...register(name)} />
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

/**
 * Tata letak FormSection.
 * - `stack`: judul di atas field (form Admin, form pengajuan).
 * - `aside`: judul di kolom kiri 230px, field di kanan (Profil Saya); di bawah 1024px bertumpuk lagi.
 */
const SECTION_LAYOUTS = {
  stack: {
    root: "flex flex-col gap-5 [section+&]:pt-[26px] [section+&]:shadow-[inset_0_1px_0_var(--line)]",
    head: "space-y-0.5",
    title: "text-[21px]",
    description: "text-sm",
    body: "grid gap-5 sm:grid-cols-2",
  },
  aside: {
    root: "grid gap-3.5 py-7 first:pt-1.5 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-x-10 [section+&]:shadow-[inset_0_1px_0_var(--line)]",
    head: "space-y-1",
    title: "text-[19px]",
    description: "text-[13.5px]",
    body: "grid gap-x-5 gap-y-[18px] sm:grid-cols-2",
  },
};

export type FormSectionLayout = keyof typeof SECTION_LAYOUTS;

/**
 * Pengelompok field form dengan judul, mis. "Data Diri". Versi tenang: tanpa kartu, langsung di
 * lembar; bagian berikutnya dipisah garis tipis.
 */
export function FormSection({
  title,
  description,
  children,
  className,
  layout = "stack",
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  layout?: FormSectionLayout;
}) {
  const classes = SECTION_LAYOUTS[layout];
  return (
    <section className={cn(classes.root, className)}>
      <div className={classes.head}>
        {/* Ukuran huruf di depan: `cn` membuang `leading-*` yang ditulis sebelum kelas ukuran huruf. */}
        <h2 className={cn(classes.title, "leading-tight font-extrabold tracking-[-0.025em] text-ink")}>{title}</h2>
        {description && <p className={cn("text-ink-3", classes.description)}>{description}</p>}
      </div>
      <div className={classes.body}>{children}</div>
    </section>
  );
}

/**
 * Daftar nilai read-only (diisi Admin) di dalam FormSection, mis. "Akun & Pekerjaan" di Profil Saya.
 * Dua kolom dengan garis tipis antarbaris; `muted` = nilai pengganti ("Belum ada", "—").
 */
export function ReadOnlyList({ items }: { items: { label: string; value: React.ReactNode; muted?: boolean }[] }) {
  return (
    <dl className="grid gap-x-8 sm:col-span-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-col gap-0.5 pt-[11px] pb-3 shadow-[inset_0_-1px_0_var(--line)] last:shadow-none sm:[&:nth-last-child(-n+2)]:shadow-none"
        >
          <dt className="text-[12.5px] font-semibold text-ink-3">{item.label}</dt>
          <dd className={cn("text-[15px] font-semibold wrap-anywhere text-ink", item.muted && "font-medium text-mute")}>{item.value}</dd>
        </div>
      ))}
    </dl>
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
      {error ? <p className="text-[12.5px] font-semibold text-red-ink">{error}</p> : hint && <p className="text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

/** Beberapa checkbox untuk nilai array, mis. divisi yang boleh memakai tipe reimburse. */
export function CheckboxGroupField({ name, label, options, required, className }: BaseFieldProps & { options: SelectOption[] }) {
  const { control } = useFormContext<FieldValues>();
  const { error } = useFieldState(name);
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-[13px] font-bold text-ink-2">
        {label}
        {required && <span className="text-red-ink"> *</span>}
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
      {error && <p className="text-[12.5px] font-semibold text-red-ink">{error}</p>}
    </fieldset>
  );
}
