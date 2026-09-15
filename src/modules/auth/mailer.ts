import "server-only";
import { isProduction } from "@/lib/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * E-mail delivery contract. No provider is configured yet: in development the
 * message is printed to the server console so the reset flow can be exercised
 * end to end. In production nothing sensitive is logged — plug a real
 * transport (Resend, SES, SMTP) into `deliver` before going live.
 */
export const mailerConfigured = false;

export async function sendMail(message: MailMessage): Promise<{ delivered: boolean }> {
  if (!mailerConfigured) {
    if (!isProduction) {
      console.info(
        [
          "",
          "┌─ VÉRTICE · e-mail (desenvolvimento — nenhum provedor configurado)",
          `│ Para: ${message.to}`,
          `│ Assunto: ${message.subject}`,
          "│",
          ...message.text.split("\n").map((l) => `│ ${l}`),
          "└─",
          "",
        ].join("\n"),
      );
    } else {
      console.error("[mailer] Nenhum provedor de e-mail configurado; mensagem não enviada.");
    }
    return { delivered: false };
  }
  return { delivered: false };
}
