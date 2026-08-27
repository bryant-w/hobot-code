import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";

import { registerQuantizationAgent, type JsonRecord, type QuantizationTransport } from "./core.ts";
import { readBundleResource } from "./bundle-source.ts";

function relayTransport(): QuantizationTransport {
  const url = String(process.env.HOBOT_QUANTIZATION_RELAY_URL ?? "").trim();
  const token = String(process.env.HOBOT_QUANTIZATION_RELAY_TOKEN ?? "").trim();
  if (!url || !token) throw new Error("Hobot quantization relay is not configured");
  return {
    async call(tool, args: JsonRecord) {
      if (tool === "source_fetch" && String(args.url ?? "").startsWith("bundle://")) {
        return readBundleResource(String(args.url), import.meta.url);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_700_000);
      try {
        const response = await fetch(`${url.replace(/\/$/, "")}/v1/call`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ tool, args }),
          signal: controller.signal,
        });
        const envelope = await response.json() as { ok?: boolean; result?: JsonRecord; error?: string };
        if (!response.ok || !envelope.ok || !envelope.result) {
          throw new Error(envelope.error || `relay HTTP ${response.status}`);
        }
        return envelope.result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export default async function registerRDKQuantizationHarness(pi: ExtensionAPI) {
  const systemPrompt = await readFile(new URL("./prompt/system.md", import.meta.url), "utf8");
  registerQuantizationAgent(pi, relayTransport(), systemPrompt.trim(), { injectPrompt: false });
}
