"use client";

// Kelompok field data karyawan, dipakai form Admin (/karyawan) dan Profil Saya (/profil).
import { DateInputField, FormSection, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { toJakartaIsoDate } from "@/lib/format";
import { DIVISION_LABEL, GENDER_LABEL, MARITAL_STATUS_LABEL, ROLE_LABEL, toOptions } from "@/lib/labels";

/** Akun & pekerjaan yang dikelola Admin. `mode="create"` menambah password awal. */
export function EmployeeAccountSection({ mode }: { mode: "create" | "edit" }) {
  return (
    <FormSection title="Akun & Pekerjaan" description="Divisi menentukan alur approval dan tipe reimburse.">
      <TextInputField name="fullName" label="Nama lengkap" required autoComplete="off" />
      <TextInputField name="email" label="Email login" type="email" required autoComplete="off" />
      {mode === "create" && (
        <TextInputField
          name="password"
          label="Password awal"
          type="password"
          required
          autoComplete="new-password"
          hint="Minimal 8 karakter. Berikan ke karyawan untuk login pertama."
        />
      )}
      <SelectInputField name="role" label="Role" required options={toOptions(ROLE_LABEL)} />
      <SelectInputField name="division" label="Divisi" required options={toOptions(DIVISION_LABEL)} />
      <TextInputField name="position" label="Jabatan" required />
      <DateInputField name="startDate" label="Tanggal masuk" required />
      {mode === "edit" && (
        <>
          <TextInputField name="employeeNo" label="Nomor karyawan" />
          <TextInputField name="level" label="Level / grade" />
        </>
      )}
    </FormSection>
  );
}

/** Data diri + pajak & BPJS — boleh diisi staf sendiri (EMP-06). */
export function EmployeePersonalSections() {
  return (
    <>
      <FormSection title="Data Diri" description="Sesuai KTP dan Kartu Keluarga.">
        <TextInputField name="nik" label="NIK" inputMode="numeric" placeholder="16 digit" />
        <TextInputField name="kkNo" label="Nomor KK" inputMode="numeric" placeholder="16 digit" />
        <TextInputField name="birthPlace" label="Tempat lahir" />
        <DateInputField name="birthDate" label="Tanggal lahir" max={toJakartaIsoDate()} />
        <SelectInputField name="gender" label="Jenis kelamin" options={toOptions(GENDER_LABEL)} />
        <SelectInputField name="maritalStatus" label="Status pernikahan" required options={toOptions(MARITAL_STATUS_LABEL)} />
        <TextInputField name="phone" label="Nomor HP" inputMode="tel" placeholder="08xxxxxxxxxx" />
        <TextareaField name="address" label="Alamat" className="sm:col-span-2" />
      </FormSection>
      <FormSection title="Pajak & BPJS">
        <TextInputField name="npwp" label="NPWP" inputMode="numeric" placeholder="15 atau 16 digit" />
        <div className="hidden sm:block" />
        <TextInputField name="bpjsTkNo" label="BPJS Ketenagakerjaan" inputMode="numeric" placeholder="11 digit" />
        <TextInputField name="bpjsKesNo" label="BPJS Kesehatan" inputMode="numeric" placeholder="13 digit" />
      </FormSection>
    </>
  );
}
