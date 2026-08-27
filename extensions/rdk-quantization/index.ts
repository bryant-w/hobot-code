import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";

import { registerQuantizationAgent } from "./core.ts";
import { createProductTransport } from "./product-transport.ts";

export default async function registerRDKQuantizationAgent(pi: ExtensionAPI) {
  const systemPrompt = await readFile(new URL("./prompt/system.md", import.meta.url), "utf8");
  registerQuantizationAgent(pi, createProductTransport(), systemPrompt.trim());
}
