import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bundleRoot = new URL("../extensions/rdk-quantization/", import.meta.url);

const digest = (value) => createHash("sha256").update(value).digest("hex");

test("RDK quantization bundle manifest binds every model-visible resource", async () => {
  const manifest = JSON.parse(await readFile(new URL("bundle.json", bundleRoot), "utf8"));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.id, "hobot.rdk-quantization-agent");
  assert.equal(manifest.toolSchemaId, "rdk-embedded-agent-tools-v1");
  const material = [];
  for (const entry of manifest.files) {
    assert.ok(!entry.path.startsWith("/") && !entry.path.includes(".."));
    const content = await readFile(new URL(entry.path, bundleRoot));
    assert.equal(content.length, entry.bytes, entry.path);
    assert.equal(digest(content), entry.sha256, entry.path);
    material.push(`${entry.sha256}  ${entry.path}\n`);
  }
  assert.equal(digest(Buffer.from(material.join(""))), manifest.fileSetSha256);
});

test("bundle exposes exactly the three production quantization tools", async () => {
  const schema = JSON.parse(await readFile(new URL("tool-schema.json", bundleRoot), "utf8"));
  assert.deepEqual(schema.tools.map((tool) => tool.name), ["remote_shell", "source_fetch", "file_copy"]);
  assert.equal(schema.tools[1].input.properties.url.pattern, "^(?:https://|bundle://)[^\\s]+$");
  const core = await readFile(new URL("core.ts", bundleRoot), "utf8");
  for (const name of ["remote_shell", "source_fetch", "file_copy"]) {
    assert.match(core, new RegExp(`name: \\"${name}\\"`));
  }
  assert.match(core, /set -e -o pipefail/);
  assert.doesNotMatch(core, /inspect_task|submit_report|evaluate_fidelity/);
});

test("production prompt contains no benchmark-only model-visible protocol", async () => {
  const prompt = await readFile(new URL("prompt/system.md", bundleRoot), "utf8");
  assert.match(prompt, /bundle:\/\/knowledge\/index\.json/);
  assert.match(prompt, /quantization\/report\.json/);
  assert.doesNotMatch(prompt, /result_manifest|hidden judge|training-data collection|benchmark/i);
});

test("product report contract is a top-level JSON Schema", async () => {
  const schema = JSON.parse(await readFile(new URL("knowledge/report-schema.json", bundleRoot), "utf8"));
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schema", "outcome", "summary", "artifact", "provenance"]);
  assert.equal(schema.properties.report, undefined);
  assert.match(schema.properties.artifact.description, /RDK board task workspace/);
  assert.match(schema["x-provenanceDelivery"].booleanMeaning, /pure PTQ/);
});

test("Hobot Code catalog declares the product-owned quantization extension", async () => {
  const catalog = JSON.parse(await readFile(new URL("../extensions/catalog.json", import.meta.url), "utf8"));
  const entry = catalog.entries.find((candidate) => candidate.id === "hobot.rdk-quantization-agent");
  assert.ok(entry);
  assert.equal(entry.entrypoint, "rdk-quantization/index.ts");
  assert.deepEqual(entry.targets, ["x5", "s100", "s600"]);
});

test("bundle source transport returns the same immutable resource digest", async () => {
  const { readBundleResource } = await import("../extensions/rdk-quantization/bundle-source.ts");
  const result = await readBundleResource(
    "bundle://knowledge/index.json",
    new URL("../extensions/rdk-quantization/product-transport.ts", import.meta.url).href,
  );
  const content = await readFile(new URL("knowledge/index.json", bundleRoot));
  assert.equal(result.sha256, digest(content));
  assert.equal(result.content, content.toString("utf8"));
  await assert.rejects(
    readBundleResource(
      "bundle://knowledge/../tool-schema.json",
      new URL("../extensions/rdk-quantization/product-transport.ts", import.meta.url).href,
    ),
    /invalid|escapes|unavailable/,
  );
});
