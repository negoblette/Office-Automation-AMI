// Schema karyawan — URD EMP-01..06, Tech Spec §6.1.
// Admin membuat akun minimal; staf melengkapi data dirinya sendiri (EMP-06).
// Divisi, role, email login, dan tanggal masuk/keluar HANYA ada di schema Admin.
import { z } from "zod";
import { Division, Gender, MaritalStatus, Role } from "@/generated/prisma/enums";
import {
  bpjsKesSchema,
  bpjsTkSchema,
  emailSchema,
  isoDateSchema,
  kkSchema,
  nikSchema,
  npwpSchema,
  optionalField,
  passwordSchema,
  personNameSchema,
  phoneSchema,
  textSchema,
} from "./common";

const divisionSchema = z.enum(Division, { error: "Divisi wajib dipilih" });
const roleSchema = z.enum(Role, { error: "Role wajib dipilih" });
const positionSchema = textSchema("Jabatan", { min: 2, max: 100 });

/** Data diri yang boleh diisi/diubah staf sendiri (juga bisa diubah Admin). */
const selfFields = {
  fullName: personNameSchema,
  position: positionSchema,
  employeeNo: optionalField(textSchema("Nomor karyawan", { max: 30 }).toUpperCase()),
  level: optionalField(textSchema("Level", { max: 50 })),
  nik: optionalField(nikSchema),
  kkNo: optionalField(kkSchema),
  birthPlace: optionalField(textSchema("Tempat lahir", { max: 100 })),
  birthDate: optionalField(isoDateSchema),
  gender: optionalField(z.enum(Gender, { error: "Jenis kelamin tidak valid" })),
  maritalStatus: z.enum(MaritalStatus, { error: "Status pernikahan wajib dipilih" }),
  address: optionalField(textSchema("Alamat", { max: 500 })),
  phone: optionalField(phoneSchema),
  npwp: optionalField(npwpSchema),
  bpjsTkNo: optionalField(bpjsTkSchema),
  bpjsKesNo: optionalField(bpjsKesSchema),
};

/**
 * Staf mengubah data dirinya. Field lain (divisi, role, email, tanggal masuk) tidak ada
 * di schema ini, jadi otomatis dibuang walau dikirim lewat request langsung.
 */
export const employeeSelfSchema = z.object(selfFields);
export type EmployeeSelfInput = z.infer<typeof employeeSelfSchema>;

/** Admin membuat akun minimal (Tech Spec §6.1). */
export const employeeCreateSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  division: divisionSchema,
  position: positionSchema,
  startDate: isoDateSchema,
  role: roleSchema,
  password: passwordSchema,
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

/** Admin mengubah semua data, termasuk divisi, role, email, dan tanggal masuk periode aktif. */
export const employeeAdminUpdateSchema = z.object({
  ...selfFields,
  email: emailSchema,
  division: divisionSchema,
  role: roleSchema,
  startDate: isoDateSchema,
});
export type EmployeeAdminUpdateInput = z.infer<typeof employeeAdminUpdateSchema>;

/** Resign: tanggal keluar (EMP-03). */
export const resignSchema = z.object({ endDate: isoDateSchema });

/** Rehire dari Arsip: tanggal masuk periode baru (EMP-04). */
export const rehireSchema = z.object({ startDate: isoDateSchema });
