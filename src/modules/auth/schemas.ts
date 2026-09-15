import { z } from "zod";

const email = z
  .string({ required_error: "Informe seu e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe seu e-mail.")
  .max(254, "E-mail longo demais.")
  .email("Informe um e-mail válido.");

// bcrypt only considers the first 72 bytes; reject longer input instead of
// silently truncating it.
export const passwordSchema = z
  .string({ required_error: "Informe uma senha." })
  .min(8, "Use pelo menos 8 caracteres.")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Use no máximo 72 caracteres.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome longo demais."),
  email,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha.").max(200),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não coincidem." });

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não coincidem." });
