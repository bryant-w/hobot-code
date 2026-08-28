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
  assert.equal(manifest.version, "2.0.0");
  assert.equal(manifest.toolSchemaId, "rdk-embedded-agent-tools-v2");
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

test("bundle exposes exactly three domain-neutral endpoint tools", async () => {
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
  assert.match(prompt, /bundle:\/\/capabilities\/index\.json/);
  assert.doesNotMatch(prompt, /quantiz|calibration|onnx|\bx86\b|\brdk\b|\bssh\b/i);
  assert.doesNotMatch(prompt, /result_manifest|hidden judge|training-data collection|benchmark/i);
});

test("quantization resource requirements live in the capability entry", async () => {
  const capability = JSON.parse(await readFile(new URL("capabilities/rdk-model-quantization.json", bundleRoot), "utf8"));
  assert.deepEqual(
    capability.requiredUserResources.map((resource) => resource.name),
    ["modelPath", "calibrationPath", "x86Ssh", "boardSsh"],
  );
  assert.equal(capability.domain, "bundle://knowledge/index.json");
  assert.equal(capability.skills, "bundle://skills/index.json");
});

test("runtime Skills expose mechanics without taking Agent decisions", async () => {
  const skills = JSON.parse(await readFile(new URL("skills/index.json", bundleRoot), "utf8"));
  assert.equal(skills.policy.decisionOwner, "agent");
  assert.equal(skills.policy.fallback, "native remote_shell commands");
  assert.deepEqual(
    skills.skills[0].implementations.map((entry) => entry.path),
    [
      "config_audit.py",
      "calibration_prepare.py",
      "classification_reference.py",
      "runtime_validation.py",
      "classification_contracts.py",
      "board_validate.py",
      "report_finalize.py",
    ],
  );
  const guide = await readFile(new URL("skills/rdk-classification-ptq.md", bundleRoot), "utf8");
  assert.match(guide, /Agent owns those decisions/);
  assert.match(guide, /Run the native compiler directly/);
  assert.doesNotMatch(guide, /10\.112\.|36\.144\.|efficientnet_lite0/);
});

test("product report contract is a top-level JSON Schema", async () => {
  const schema = JSON.parse(await readFile(new URL("knowledge/report-schema.json", bundleRoot), "utf8"));
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schema", "outcome", "summary", "artifact", "provenance"]);
  assert.equal(schema.properties.report, undefined);
  assert.match(schema.properties.artifact.description, /RDK board task workspace/);
  assert.equal(schema["x-provenanceDocument"].requiredTopLevelSection, "delivery");
  assert.match(schema["x-provenanceDocument"].delivery.booleanMeaning, /pure PTQ/);
});

test("Hobot Code catalog declares the product-owned quantization extension", async () => {
  const catalog = JSON.parse(await readFile(new URL("../extensions/catalog.json", import.meta.url), "utf8"));
  const entry = catalog.entries.find((candidate) => candidate.id === "hobot.rdk-quantization-agent");
  assert.ok(entry);
  assert.equal(entry.version, "2.0.0");
  assert.equal(entry.entrypoint, "rdk-quantization/index.ts");
  assert.deepEqual(entry.targets, ["x5", "s100", "s600"]);
});

test("bundle source transport returns the same immutable resource digest", async () => {
  const { readBundleResource } = await import("../extensions/rdk-quantization/bundle-source.ts");
  const result = await readBundleResource(
    "bundle://capabilities/index.json",
    new URL("../extensions/rdk-quantization/product-transport.ts", import.meta.url).href,
  );
  const content = await readFile(new URL("capabilities/index.json", bundleRoot));
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
