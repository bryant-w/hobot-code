import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { promisify } from "node:util";

import { readBundleResource } from "./bundle-source.ts";
import type { JsonRecord, QuantizationTransport } from "./core.ts";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const OFFICIAL_HOSTS = new Set(["github.com", "raw.githubusercontent.com", "api.github.com", "huggingface.co"]);
const OFFICIAL_REPOSITORIES = new Set([
  "D-Robotics/rdk_model_zoo",
  "huggingface/pytorch-image-models",
  "ultralytics/ultralytics",
  "pytorch/vision",
  "huggingface/transformers",
  "onnx/models",
  "open-mmlab/mmdetection",
]);
const TARGET = /^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function taskID() {
  const value = String(process.env.HOBOT_CODE_TASK_ID ?? "interactive").trim();
  return /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : "interactive";
}

function workspaceCommand(command: string, timeoutSeconds: number) {
  const workspace = `.hobot/quantization-tasks/${taskID()}`;
  const body = `workspace="$HOME/${workspace}"; mkdir -p "$workspace" && cd "$workspace" && set -e -o pipefail; ${command}`;
  return `/usr/bin/timeout --signal=TERM --kill-after=5s ${timeoutSeconds}s /bin/bash --noprofile --norc -lc ${shellQuote(body)}`;
}

function sshArgs(target: string, command: string) {
  requireValue(TARGET.test(target), "SSH destination is invalid");
  return [
    "-T", "-o", "BatchMode=yes", "-o", "ClearAllForwardings=yes",
    "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3", target, command,
  ];
}

function bounded(text: string) {
  const bytes = Buffer.from(text);
  if (bytes.length <= MAX_OUTPUT_BYTES) return { text, truncated: false };
  return { text: bytes.subarray(0, MAX_OUTPUT_BYTES).toString("utf8"), truncated: true };
}

async function runSSH(target: string, command: string, timeoutSeconds: number) {
  try {
    const result = await execFileAsync("ssh", sshArgs(target, command), {
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT_BYTES + 1,
      timeout: (timeoutSeconds + 15) * 1000,
      windowsHide: true,
    });
    const stdout = bounded(result.stdout);
    const stderr = bounded(result.stderr);
    return { exitCode: 0, stdout: stdout.text, stderr: stderr.text, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated };
  } catch (error: any) {
    const stdout = bounded(String(error?.stdout ?? ""));
    const stderr = bounded(String(error?.stderr ?? error?.message ?? error));
    return {
      exitCode: Number.isInteger(error?.code) ? error.code : error?.killed ? 124 : 255,
      stdout: stdout.text,
      stderr: stderr.text,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
    };
  }
}

function safeRelativePath(value: unknown, label: string) {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= 1024, `${label} is invalid`);
  requireValue(!value.startsWith("/") && !value.split("/").some((part) => part === "" || part === "." || part === ".."), `${label} must be a relative regular-file path`);
  return value;
}

function validateOfficialURL(value: string) {
  const parsed = new URL(value);
  requireValue(parsed.protocol === "https:" && OFFICIAL_HOSTS.has(parsed.hostname), "official source host is not allowed");
  requireValue(!parsed.username && !parsed.password && !parsed.hash, "official source URL contains credentials or a fragment");
  const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parsed.hostname === "github.com" || parsed.hostname === "raw.githubusercontent.com") {
    requireValue(parts.length >= 2 && OFFICIAL_REPOSITORIES.has(`${parts[0]}/${parts[1]}`), "official GitHub repository is not allowed");
  } else if (parsed.hostname === "api.github.com") {
    requireValue(parts.length >= 3 && parts[0] === "repos" && OFFICIAL_REPOSITORIES.has(`${parts[1]}/${parts[2]}`), "official GitHub API repository is not allowed");
  } else if (parsed.hostname === "huggingface.co") {
    requireValue(parts[0] === "timm", "official Hugging Face source must belong to timm");
  }
  return parsed;
}

async function fetchSource(url: string) {
  let content: Buffer;
  let finalURL = url;
  let contentType = "text/plain";
  if (url.startsWith("bundle://")) {
    return readBundleResource(url, import.meta.url);
  } else {
    validateOfficialURL(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "hobot-code-rdk-quantization/1" } });
      requireValue(response.ok, `official source returned HTTP ${response.status}`);
      finalURL = response.url;
      validateOfficialURL(finalURL);
      contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? contentType;
      content = Buffer.from(await response.arrayBuffer());
      requireValue(content.length > 0 && content.length <= MAX_SOURCE_BYTES, "official source is empty or too large");
    } finally {
      clearTimeout(timer);
    }
  }
  const text = content.toString("utf8");
  requireValue(!text.includes("\uFFFD"), "source is not valid UTF-8 text");
  return {
    auditId: randomBytes(12).toString("hex"),
    requestedUrl: url,
    finalUrl: finalURL,
    contentType,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    content: text,
    retrievedAt: new Date().toISOString(),
  };
}

async function remoteDigest(target: string, path: string) {
  const command = workspaceCommand(`test -f ${shellQuote(path)} && sha256sum -- ${shellQuote(path)} | awk '{print $1}'`, 60);
  const result = await runSSH(target, command, 60);
  requireValue(result.exitCode === 0 && SHA256.test(result.stdout.trim()), `cannot hash ${path} on ${target}: ${result.stderr}`);
  return result.stdout.trim();
}

async function copyFile(args: JsonRecord) {
  const sourceTarget = String(args.sourceTarget ?? "");
  const destinationTarget = String(args.destinationTarget ?? "");
  requireValue(TARGET.test(sourceTarget) && TARGET.test(destinationTarget) && sourceTarget !== destinationTarget, "file endpoints are invalid or identical");
  const sourcePath = safeRelativePath(args.sourcePath, "sourcePath");
  const destinationPath = safeRelativePath(args.destinationPath, "destinationPath");
  const expected = String(args.expectedSha256 ?? "");
  requireValue(SHA256.test(expected), "expectedSha256 is invalid");
  requireValue(await remoteDigest(sourceTarget, sourcePath) === expected, "source digest differs");
  const destinationParent = dirname(destinationPath);
  const prepare = await runSSH(destinationTarget, workspaceCommand(`mkdir -p ${shellQuote(destinationParent)}`, 60), 60);
  requireValue(prepare.exitCode === 0, `cannot prepare destination: ${prepare.stderr}`);
  const remoteRoot = `.hobot/quantization-tasks/${taskID()}`;
  const result = await execFileAsync("scp", [
    "-3", "-p", "-q", "-o", "BatchMode=yes", "-o", "ClearAllForwardings=yes",
    "-o", "ConnectTimeout=10", "--",
    `${sourceTarget}:${remoteRoot}/${sourcePath}`,
    `${destinationTarget}:${remoteRoot}/${destinationPath}`,
  ], { encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES, timeout: 10 * 60 * 1000, windowsHide: true });
  requireValue(!result.stderr, `file copy failed: ${result.stderr}`);
  requireValue(await remoteDigest(destinationTarget, destinationPath) === expected, "destination digest differs");
  return { auditId: randomBytes(12).toString("hex"), sourceTarget, destinationTarget, sourcePath, destinationPath, sha256: expected };
}

export function createProductTransport(): QuantizationTransport {
  return {
    async call(tool, args) {
      if (tool === "source_fetch") return fetchSource(String(args.url ?? ""));
      if (tool === "file_copy") return copyFile(args);
      const target = String(args.target ?? "");
      const command = String(args.command ?? "");
      const timeoutSeconds = Number(args.timeoutSeconds ?? 120);
      requireValue(TARGET.test(target) && command.length > 0 && command.length <= 16384, "remote shell arguments are invalid");
      requireValue(Number.isInteger(timeoutSeconds) && timeoutSeconds >= 1 && timeoutSeconds <= 3600, "timeoutSeconds is invalid");
      const result = await runSSH(target, workspaceCommand(command, timeoutSeconds), timeoutSeconds);
      return { auditId: randomBytes(12).toString("hex"), ...result };
    },
  };
}
