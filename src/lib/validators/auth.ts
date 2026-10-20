import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-policy";
import { passwordSchema } from "./common";

export const loginSchema = z.object({
  email: z
    .string({ error: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Format email tidak valid" })),
  // Batas atas mencegah input sangat panjang membebani argon2.
  password: z
    .string({ error: "Password wajib diisi" })
    .min(1, { error: "Password wajib diisi" })
    .max(PASSWORD_MAX_LENGTH, { error: `Password maksimal ${PASSWORD_MAX_LENGTH} karakter` }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Ganti password sendiri (hardening 2026-10). */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Password saat ini wajib diisi" })
      .min(1, { error: "Password saat ini wajib diisi" })
      .max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    confirmPassword: z.string({ error: "Ulangi password baru" }),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi password tidak sama",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
