# RDK Quantization Agent Bundle

Hobot Code owns the model-visible quantization interface under
`extensions/rdk-quantization/`. The same immutable Bundle is exported into the
training Harness before collection. Its root manifest binds every file and the
ordered file-set SHA-256.

The shared surface contains:

- the conditional quantization system prompt;
- exactly three tools: `remote_shell`, `source_fetch`, and `file_copy`;
- `bundle://` knowledge, OpenExplorer templates, report contract, and official
  source registry;
- product and Harness entrypoints that call the same tool-registration core.

Hobot Code uses `index.ts` with the product SSH/HTTPS transport. The Harness
uses `harness-entry.ts` with its isolated relay transport. Tool names,
descriptions, parameter schemas, Bundle resources, and prompt bytes remain
identical. Backend-specific isolation is outside the model-visible contract.

The Harness may add only model-invisible controls: prompt sampling, event
recording, leases, independent Judge execution, trajectory linting, admission,
and signing. Completion uses the product report at
`quantization/report.json`; the model does not receive a benchmark submission
marker or hidden acceptance threshold.

Rebuild and optionally export the Bundle with:

```bash
node scripts/build-rdk-quantization-bundle.mjs

node scripts/build-rdk-quantization-bundle.mjs \
  --export /path/to/rdk-quantization-agent-harness/benchmark/agent-bundles/rdk-quantization-v1
```

Both consumers validate `bundle.json` before use. Any prompt, schema,
knowledge, template, extension, or source-registry drift changes
`fileSetSha256` and prevents a pinned Harness suite from starting.
