import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const QUANTIZATION_BUNDLE_ID = "hobot.rdk-quantization-agent";
export const QUANTIZATION_BUNDLE_VERSION = "1.0.0";
export const QUANTIZATION_TOOL_SCHEMA_ID = "rdk-embedded-agent-tools-v1";

export type JsonRecord = Record<string, unknown>;

export interface QuantizationTransport {
  call(tool: "remote_shell" | "source_fetch" | "file_copy", args: JsonRecord): Promise<JsonRecord>;
}

const sshTarget = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: "^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$",
});

const remoteShellSchema = Type.Object({
  target: sshTarget,
  command: Type.String({ minLength: 1, maxLength: 16384 }),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600 })),
}, { additionalProperties: false });

const sourceFetchSchema = Type.Object({
  url: Type.String({
    minLength: 12,
    maxLength: 2048,
    pattern: "^(?:https://|bundle://)[^\\s]+$",
  }),
}, { additionalProperties: false });

const fileCopySchema = Type.Object({
  sourceTarget: sshTarget,
  destinationTarget: sshTarget,
  sourcePath: Type.String({ minLength: 1, maxLength: 1024 }),
  destinationPath: Type.String({ minLength: 1, maxLength: 1024 }),
  expectedSha256: Type.String({ pattern: "^[0-9a-f]{64}$" }),
}, { additionalProperties: false });

function toolResult(value: JsonRecord) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    details: value,
  };
}

const QUANTIZATION_INTENT = /(?:量化|转换.*(?:模型|onnx)|部署.*(?:x5|s100|s600|rdk)|quantiz|convert.*model|deploy.*(?:x5|s100|s600|rdk))/iu;

export function registerQuantizationAgent(
  pi: ExtensionAPI,
  transport: QuantizationTransport,
  systemPrompt: string,
  options: { injectPrompt?: boolean } = {},
) {
  pi.registerTool({
    name: "remote_shell",
    label: "Run endpoint shell",
    description: "Run one synchronous Bash command on an exact user-declared x86 or RDK SSH destination. Each destination uses a private task workspace for relative paths; user-declared absolute input paths remain readable according to endpoint permissions. Bash starts with set -e -o pipefail; use set +e only around an optional probe whose nonzero status you will inspect. Commands and descendants are terminated at timeoutSeconds. Use 30-60 seconds for probes and explicit longer limits only for foreground conversion, evaluation, or performance. Keep scripts and generated files in separate calls and each command comfortably below the 16384-character schema limit. Never retry a hanging command unchanged. The result contains auditId, exitCode, bounded stdout/stderr, and truncation flags.",
    promptSnippet: "Run bounded native commands on the user-declared x86 toolchain host or RDK board",
    parameters: remoteShellSchema,
    async execute(_id, args) {
      return toolResult(await transport.call("remote_shell", args));
    },
  });

  pi.registerTool({
    name: "source_fetch",
    label: "Read quantization source",
    description: "Read one immutable bundle resource through bundle:// or one anonymous official HTTPS source document. Bundle resources contain the shared Hobot Code quantization prompt, knowledge, templates, helper contracts, and source registry. Official network retrieval is GET-only, allowlisted, size-bounded, and digest-recorded. This tool returns evidence; it never decides model identity or preprocessing semantics.",
    promptSnippet: "Read the shared quantization bundle or targeted official model sources",
    parameters: sourceFetchSchema,
    async execute(_id, args) {
      return toolResult(await transport.call("source_fetch", args));
    },
  });

  pi.registerTool({
    name: "file_copy",
    label: "Copy verified endpoint file",
    description: "Copy one regular file between two different user-declared SSH endpoints. Paths are relative to each endpoint's private task workspace; absolute paths, traversal, directories, and globs are rejected. expectedSha256 is checked at source and destination. Create one archive with remote_shell before transferring a directory or file set.",
    promptSnippet: "Transfer one digest-verified model or evidence archive between x86 and RDK workspaces",
    parameters: fileCopySchema,
    async execute(_id, args) {
      return toolResult(await transport.call("file_copy", args));
    },
  });

  if (options.injectPrompt !== false) {
    pi.on("before_agent_start", async (event) => {
      if (!QUANTIZATION_INTENT.test(String(event.prompt ?? ""))) return;
      return {
        systemPrompt: [event.systemPrompt, systemPrompt].filter(Boolean).join("\n\n"),
      };
    });
  }
}
