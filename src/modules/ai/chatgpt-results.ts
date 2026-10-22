// Shared by the callback route and the connection dialog — keep free of Node-only imports.

/** The sign-in popup reports back here: OpenAI's pages sever `window.opener`. */
export const CONNECT_CHANNEL = "vertice-chatgpt";

/** Result codes the callback passes back (URL or popup message); only the code travels, never provider text. */
export const CALLBACK_RESULT = {
  conectado: { tone: "positive", text: "ChatGPT conectado. Questões, redação, Mentor e editais já usam seu plano." },
  "sem-modelo": { tone: "warning", text: "Conta conectada, mas a OpenAI não liberou nenhum modelo para esta aplicação. Verifique a elegibilidade do plano e tente de novo." },
  cancelado: { tone: "warning", text: "A autorização foi cancelada ou recusada na página da OpenAI." },
  expirado: { tone: "warning", text: "A tentativa de conexão expirou ou foi iniciada em outro navegador. Clique em Conectar de novo." },
  escopo: { tone: "danger", text: "A conta foi conectada, mas o uso do plano não foi autorizado. Reconecte e permita o uso do plano; a elegibilidade depende da OpenAI." },
  falha: { tone: "danger", text: "Não foi possível concluir a conexão. Veja o terminal do servidor e tente de novo." },
} as const;
export type CallbackResult = keyof typeof CALLBACK_RESULT;
