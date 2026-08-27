#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(repository, "extensions/rdk-quantization");
const files = [
  "bundle-source.ts",
  "core.ts",
  "harness-entry.ts",
  "index.ts",
  "product-transport.ts",
  "tool-schema.json",
  "prompt/system.md",
  "knowledge/index.json",
  "knowledge/workflow.md",
  "knowledge/model-contract.md",
  "knowledge/calibration.md",
  "knowledge/report-schema.json",
  "templates/x5-onnx.yaml",
  "templates/s100-onnx.yaml",
  "templates/s600-onnx.yaml",
  "official-sources/index.json"
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function manifest() {
  const entries = [];
  for (const path of files) {
    const content = await readFile(resolve(root, path));
    entries.push({ path, bytes: content.length, sha256: sha256(content) });
  }
  const fileSetSha256 = sha256(Buffer.from(entries.map((item) => `${item.sha256}  ${item.path}\n`).join("")));
  return {
    schema: 1,
    id: "hobot.rdk-quantization-agent",
    version: "1.0.0",
    toolSchemaId: "rdk-embedded-agent-tools-v1",
    entrypoints: { product: "index.ts", harness: "harness-entry.ts" },
    resourceScheme: "bundle",
    files: entries,
    fileSetSha256
  };
}

const value = await manifest();
await writeFile(resolve(root, "bundle.json"), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });

const exportIndex = process.argv.indexOf("--export");
if (exportIndex >= 0) {
  const destination = resolve(process.argv[exportIndex + 1] ?? "");
  if (!process.argv[exportIndex + 1] || destination === root || !destination.includes("rdk-quantization")) {
    throw new Error("--export requires a distinct rdk-quantization destination");
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true, mode: 0o755 });
  for (const path of [...files, "bundle.json"]) {
    const target = resolve(destination, path);
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await cp(resolve(root, path), target, { force: false, errorOnExist: true });
  }
  process.stdout.write(`${JSON.stringify({ source: relative(repository, root), destination, fileSetSha256: value.fileSetSha256 })}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ bundle: relative(repository, root), fileSetSha256: value.fileSetSha256 })}\n`);
}
