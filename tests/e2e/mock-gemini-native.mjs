// Stand-in for the native Gemini API used by the question bank: Files API uploads and
// generateContent with JSON schemas. Strict where Google is strict: API key header,
// schema present, file_data URIs it issued. Answers a fixed 20-question exam.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const [LOG] = process.argv.slice(2);
writeFileSync(LOG, "");
const PORT = 4030;
const files = new Set();
let n = 0;

// Official key of the mock exam, version BRANCA: Matemática 1–12, Física 13–20.
const KEY = "BCDAEBCDAEBC" + "DAEBCDAE";
const letterFor = (q) => KEY[q - 1];
const ANNULLED = 5;
const CHANGED = 7; // printed as "Alterada de A para C"

export const QUESTION_TEXT = (q) =>
  q === 3
    ? "Observe a [[FIGURA 1]] e determine a area do triangulo destacado em centimetros quadrados."
    : q === 9
      ? "Uma loja vende uma camisa por R$ 150,00 e sabe que $x^2 = 49$. Qual o valor positivo de $x$?"
      : q === 12
        ? "O determinante da matriz vale 1176 segundo o enunciado original da questao doze."
        : `Questao numero ${q} da prova simulada: calcule o valor pedido com cuidado e marque a alternativa.`;

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const answer = (res, model, data) =>
  json(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 }, modelVersion: model });

createServer(async (req, res) => {
  let raw = [];
  for await (const chunk of req) raw.push(chunk);
  const body = Buffer.concat(raw);
  n++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const entry = { n, method: req.method, path: url.pathname, key: req.headers["x-goog-api-key"] ?? null, command: req.headers["x-goog-upload-command"] ?? null };

  if (url.pathname.startsWith("/upload-session/")) {
    appendFileSync(LOG, JSON.stringify({ ...entry, bytes: body.length }) + "\n");
    const id = url.pathname.split("/").pop();
    files.add(id);
    return json(res, 200, { file: { name: `files/${id}`, uri: `http://localhost:${PORT}/v1beta/files/${id}`, state: "ACTIVE" } });
  }
  if (entry.key !== "mock-gemini-key") {
    appendFileSync(LOG, JSON.stringify(entry) + "\n");
    return json(res, 401, [{ error: { code: 401, message: "API key not valid.", status: "UNAUTHENTICATED" } }]);
  }
  if (req.method === "POST" && url.pathname === "/upload/v1beta/files") {
    appendFileSync(LOG, JSON.stringify(entry) + "\n");
    const id = `f${n}`;
    res.writeHead(200, { "x-goog-upload-url": `http://localhost:${PORT}/upload-session/${id}`, "content-type": "application/json" });
    return res.end("{}");
  }
  const match = /^\/v1beta\/models\/([^:]+):generateContent$/.exec(url.pathname);
  if (!match) return json(res, 404, { error: "not found" });
  const model = decodeURIComponent(match[1]);
  const request = JSON.parse(body.toString("utf8"));
  const parts = request.contents[0].parts;
  const text = parts.map((p) => p.text ?? "").join("\n");
  const fileUris = parts.filter((p) => p.file_data).map((p) => p.file_data.file_uri);
  appendFileSync(LOG, JSON.stringify({ ...entry, model, system: request.systemInstruction?.parts?.[0]?.text?.slice(0, 60) ?? null, text: text.slice(0, 6000), fileUris, generationConfig: request.generationConfig }) + "\n");

  if (!request.generationConfig?.responseSchema) return json(res, 400, [{ error: { code: 400, message: "responseSchema required by this mock", status: "INVALID_ARGUMENT" } }]);
  for (const uri of fileUris) if (!files.has(uri.split("/").pop())) return json(res, 403, [{ error: { code: 403, message: "You do not have permission to access the File or it may not exist.", status: "PERMISSION_DENIED" } }]);

  // Daily free quota exhausted for the "lite" model when the exam version asks for it.
  if (text.includes("COTA ESGOTADA") && model.includes("lite")) {
    return json(res, 429, [{ error: { code: 429, message: "You exceeded your current quota", status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }]);
  }

  if (text.includes("gabarito oficial de um concurso")) {
    const block = (section, from, to) => ({
      version: "BRANCA",
      section,
      answers: Array.from({ length: to - from + 1 }, (_, i) => {
        const q = from + i;
        if (q === ANNULLED) return { number: q, label: "", annulled: true };
        return { number: q, label: q === CHANGED ? "Alterada de A para C" : letterFor(q), annulled: false };
      }),
    });
    return answer(res, model, { kind: "DEFINITIVO", sections: [block("MATEMÁTICA", 1, 12), block("FÍSICA", 13, 20), { version: "AMARELA", section: "MATEMÁTICA", answers: [{ number: 1, label: "E", annulled: false }] }] });
  }

  const range = /Transcreva as questões de número (\d+) a (\d+)/.exec(text);
  if (range) {
    const from = Number(range[1]);
    const to = Math.min(20, Number(range[2]));
    const questions = [];
    for (let q = from; q <= to; q++) {
      questions.push({
        number: q,
        page: q === 3 ? 2 : 1,
        subject: q <= 12 ? "matematica" : "fisica",
        topic: "",
        difficulty: q % 3 === 0 ? "HARD" : "MEDIUM",
        statement: QUESTION_TEXT(q),
        options: ["A", "B", "C", "D", "E"].map((label, i) => ({ label: `(${label})`, text: `${q * 10 + i}` })),
        figures: q === 3 ? [{ page: 2, box_2d: [100, 100, 400, 600], description: "Triangulo retangulo com catetos 3 e 4" }] : [],
      });
    }
    const first = text.includes("Primeiro descreva a prova");
    return answer(res, model, { ...(first ? { paper: { title: "PROVA SIMULADA", totalQuestions: 20, sections: [{ subject: "Matemática", from: 1, to: 12 }, { subject: "Física", from: 13, to: 20 }] } } : {}), questions });
  }

  if (text.includes("O gabarito oficial de cada questão abaixo está indicado")) {
    const items = [...text.matchAll(/### (\w+) \(gabarito oficial: ([A-E])\)/g)];
    return answer(res, model, { solutions: items.map(([, ref, label]) => ({ ref, answer: label, explanation: `Pelo gabarito, a alternativa ${label}: $a^2 + b^2 = c^2$.`, confidence: "HIGH" })) });
  }

  if (text.includes("Resolva cada questão abaixo")) {
    const refs = [...text.matchAll(/### (\w+)/g)].map((m) => m[1]);
    return answer(res, model, {
      solutions: refs.map((ref) => {
        const q = Number(ref.slice(1));
        const letter = ref.startsWith("G") ? (q === 2 ? "D" : "B") : q === 10 ? "A" : letterFor(q) === "A" && q === CHANGED ? "C" : q === CHANGED ? "C" : letterFor(q);
        return { ref, answer: letter, explanation: `Resolução da ${ref}: como $x = 7$, a resposta é ${letter}.`, confidence: "HIGH" };
      }),
    });
  }

  const create = /Crie (\d+) questões inéditas/.exec(text);
  if (create) {
    const count = Number(create[1]);
    const topic = /(T\d+):/.exec(text)?.[1] ?? "";
    return answer(res, model, {
      questions: Array.from({ length: count }, (_, i) => ({
        topic,
        difficulty: "MEDIUM",
        statement: `Questao gerada ${i + 1}: um navio percorre $${(i + 2) * 10}$ km em ${i + 2} horas. Qual a velocidade media?`,
        options: ["A", "B", "C", "D", "E"].map((label, j) => ({ label, text: `${j * 5 + 5} km/h` })),
        answer: "B",
        explanation: "Velocidade media é distância dividida pelo tempo: $v = d/t = 10$ km/h.",
        styleNote: "Contexto naval, cálculo direto, como nas questões de referência.",
      })),
    });
  }

  return json(res, 400, [{ error: { code: 400, message: "mock does not understand this prompt", status: "INVALID_ARGUMENT" } }]);
}).listen(PORT, () => console.log(`mock gemini native on ${PORT}`));
