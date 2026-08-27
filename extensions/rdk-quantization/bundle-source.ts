import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function readBundleResource(url: string, moduleURL: string) {
  const parsed = new URL(url);
  requireValue(parsed.protocol === "bundle:" && !parsed.username && !parsed.password && !parsed.hash, "bundle resource URL is invalid");
  const relative = [parsed.hostname, ...parsed.pathname.split("/").filter(Boolean)].join("/");
  requireValue(relative && !relative.split("/").some((part) => part === "." || part === ".."), "bundle resource path is invalid");
  const root = resolve(dirname(fileURLToPath(moduleURL)));
  const path = resolve(root, relative);
  requireValue(path.startsWith(`${root}/`), "bundle resource escapes the bundle root");
  const info = await stat(path).catch(() => undefined);
  requireValue(info, "bundle resource is unavailable or too large");
  requireValue(info.isFile() && info.size > 0 && info.size <= MAX_SOURCE_BYTES, "bundle resource is unavailable or too large");
  const content = await readFile(path);
  const text = content.toString("utf8");
  requireValue(!text.includes("\uFFFD"), "bundle resource is not valid UTF-8 text");
  return {
    auditId: randomBytes(12).toString("hex"),
    requestedUrl: url,
    finalUrl: url,
    contentType: path.endsWith(".json") ? "application/json" : "text/plain",
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    content: text,
    retrievedAt: new Date().toISOString(),
  };
}
