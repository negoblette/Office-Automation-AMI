import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ error: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Format email tidak valid" })),
  password: z.string({ error: "Password wajib diisi" }).min(1, { error: "Password wajib diisi" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
