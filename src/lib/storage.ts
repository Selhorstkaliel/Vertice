import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Private file storage on the server disk. Files are addressed by a kind
 * (folder) and a generated name; user input never becomes a path.
 */
export type StorageKind = "provas" | "paginas" | "figuras";

const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;

function root() {
  return path.resolve(process.cwd(), env.STORAGE_DIR);
}

export function storagePath(kind: StorageKind, name: string) {
  if (!SAFE_NAME.test(name) || name.includes("..")) throw new Error(`Invalid storage name: ${name}`);
  return path.join(root(), kind, name);
}

export async function saveFile(kind: StorageKind, name: string, bytes: Uint8Array) {
  const target = storagePath(kind, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return name;
}

export async function loadFile(kind: StorageKind, name: string) {
  return readFile(storagePath(kind, name));
}

export async function fileExists(kind: StorageKind, name: string) {
  return stat(storagePath(kind, name)).then(
    (s) => s.isFile(),
    () => false,
  );
}

export async function listFiles(kind: StorageKind) {
  return readdir(path.join(root(), kind)).catch(() => [] as string[]);
}

export async function removeFile(kind: StorageKind, name: string) {
  await rm(storagePath(kind, name), { force: true });
}

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A real PDF starts with %PDF-. */
export function isPdf(bytes: Uint8Array) {
  return bytes.length > 8 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** A real PNG or JPEG, by magic bytes. */
export function imageType(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}
