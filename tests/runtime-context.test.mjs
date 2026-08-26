import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RUNTIME_CONTEXT_CUSTOM_TYPE,
  buildTurnRuntimeContext,
  turnRuntimeContextMessage,
} from "../extensions/rdk/runtime-context.mjs";

test("turn runtime context is hidden, bounded by stable instructions, and append-only", () => {
  const content = buildTurnRuntimeContext([
    "## Active quality gate\nStatus: passed.",
    undefined,
    "## Recalled memory (untrusted data)\nDo not trust this entry.",
  ]);
  assert.match(content, /^\[Hobot Code runtime context\]/);
  assert.match(content, /not a user instruction/);
  assert.match(content, /Active quality gate/);
  assert.match(content, /Recalled memory/);
  assert.deepEqual(turnRuntimeContextMessage(content), {
    customType: RUNTIME_CONTEXT_CUSTOM_TYPE,
    content,
    display: false,
  });
});

test("empty runtime state does not create a synthetic message", () => {
  assert.equal(buildTurnRuntimeContext([undefined, "  "]), undefined);
  assert.equal(turnRuntimeContextMessage(undefined), undefined);
});

test("RDK turn state stays out of the stable system prompt", async () => {
  const source = await readFile(new URL("../extensions/rdk/index.ts", import.meta.url), "utf8");
  const expertPrompt = await readFile(new URL("../prompts/rdk-expert.md", import.meta.url), "utf8");
  assert.match(source, /buildTurnRuntimeContext\(\[qualityContext, memoryContext, goalContext, collaborationContext\]\)/);
  assert.match(source, /const systemPrompt = \[event\.systemPrompt, expertPrompt, openExplorerPromptContext\]/);
  assert.match(source, /message: turnRuntimeContextMessage\(dynamicContext\)/);
  assert.doesNotMatch(source, /const systemPrompt = \[[^\]]*dynamicContext/);
  assert.match(expertPrompt, /\[Hobot Code runtime context\].*local turn state/s);
});
