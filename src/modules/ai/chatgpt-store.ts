import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const registrationSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().min(1),
  email: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  scopes: z.array(z.string()),
  expiresAt: z.number(),
  model: z.string().optional(),
});
const stateSchema = z.object({
  version: z.literal(1),
  hostId: z.string().startsWith("urn:uuid:"),
  activeClientId: z.string().nullable(),
  registrations: z.array(registrationSchema),
  // Retained before code exchange so a failed exchange does not lose the issued client ID.
  pendingClientId: z.string().optional(),
});
export type ChatGptRegistration = z.infer<typeof registrationSchema>;
export type ChatGptState = z.infer<typeof stateSchema>;

/** Credentials never enter the database, browser storage, logs or Git. */
export class ChatGptStore {
  readonly file: string;
  private readonly key: Buffer;
  constructor(readonly directory: string, secret: string) {
    this.file = path.join(directory, "connection.enc");
    this.key = Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.from("vertice-chatgpt-v1"), Buffer.from("credentials"), 32));
  }
  private decode(bytes: Buffer): ChatGptState {
    if (bytes.subarray(0, 4).toString() !== "VCP1" || bytes.length < 32) throw new Error("Arquivo de conexão do ChatGPT inválido.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, bytes.subarray(4, 16));
    decipher.setAuthTag(bytes.subarray(16, 32));
    return stateSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]).toString("utf8")));
  }
  readSync(): ChatGptState | null {
    if (!existsSync(this.file)) return null;
    return this.decode(readFileSync(this.file));
  }
  async read(): Promise<ChatGptState | null> {
    try { return this.decode(await readFile(this.file)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async save(state: ChatGptState) {
    stateSchema.parse(state);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
    const temp = path.join(this.directory, `connection-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, Buffer.concat([Buffer.from("VCP1"), iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: "wx" });
      await rename(temp, this.file);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
  }
  /** Serialize rotating refresh tokens across CLI scripts and Next worker processes. */
  async locked<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, "connection.lock");
    for (let attempt = 0; ; attempt++) {
      let handle;
      try { handle = await open(lock, "wx", 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (attempt >= 100) throw new Error("A conexão do ChatGPT está ocupada. Se um processo foi interrompido, feche o Vértice e remova apenas .chatgpt/connection.lock antes de reconectar.");
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      try { return await work(); }
      finally { await handle.close(); await unlink(lock).catch(() => undefined); }
    }
  }
}

export function activeRegistration(state: ChatGptState | null) {
  return state?.registrations.find((r) => r.clientId === state.activeClientId) ?? null;
}
