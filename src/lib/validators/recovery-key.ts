// Kunci pemulihan (Setting → Kunci Pemulihan, services/recovery-key.ts). Kata sandi pemulihan mengikuti kebijakan
// password (15–128 karakter, tidak mudah ditebak) dan sengaja tidak di-trim: harus diketik persis sama saat pemulihan.
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/password-policy";

const passphraseSchema = z
  .string({ error: "Kata sandi pemulihan wajib diisi" })
  .min(PASSWORD_MIN_LENGTH, { error: `Kata sandi pemulihan minimal ${PASSWORD_MIN_LENGTH} karakter` })
  .max(PASSWORD_MAX_LENGTH, { error: `Kata sandi pemulihan maksimal ${PASSWORD_MAX_LENGTH} karakter` })
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem.replace(/^Password/, "Kata sandi pemulihan") });
  });

export const recoveryKeySchema = z
  .object({
    passphrase: passphraseSchema,
    confirmPassphrase: z.string({ error: "Ulangi kata sandi pemulihan" }),
    loginPassword: z
      .string({ error: "Password login wajib diisi" })
      .min(1, { error: "Password login wajib diisi" })
      .max(PASSWORD_MAX_LENGTH),
    acknowledged: z.boolean().refine((value) => value, { message: "Centang pernyataan ini untuk melanjutkan" }),
  })
  .refine((values) => values.passphrase === values.confirmPassphrase, {
    path: ["confirmPassphrase"],
    message: "Kata sandi pemulihan tidak sama",
  })
  .refine((values) => values.passphrase !== values.loginPassword, {
    path: ["passphrase"],
    message: "Kata sandi pemulihan harus berbeda dari password login",
  });

export type RecoveryKeyInput = z.infer<typeof recoveryKeySchema>;

// Nama field beda dari form buat kunci: kedua form tampil di halaman yang sama (id input harus unik).
export const recoveryKeyTestSchema = z.object({
  testPassphrase: z
    .string({ error: "Kata sandi pemulihan wajib diisi" })
    .min(1, { error: "Kata sandi pemulihan wajib diisi" })
    .max(PASSWORD_MAX_LENGTH),
});
