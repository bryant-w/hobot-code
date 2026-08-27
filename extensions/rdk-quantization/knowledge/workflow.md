# Quantization workflow

Inspect the user model and data before choosing a configuration. Retrieve exact vendor deployment files and the upstream model card when available. Use the bundle, public command help, version output, compiler/runtime errors, and generated reports before reading installed package implementation. Write a concise sourced task specification before conversion. Transform calibration into the floating model boundary only when the compiler consumes that domain. Preserve the original user data.

Commands run with `set -e -o pipefail`. Keep optional probes in their own calls, or use `set +e` only around a probe and report its status. Keep setup, integrity checks, physical inference, and measurement independently observable instead of placing them behind an expected-empty filter or one long conditional chain.

Use action-first turns: retain settled facts in task artifacts, not repeated prose. Do not draft executable code in the explanation before calling the tool. Compare materially different contracts only; choose the most directly applicable exact source before empirical validation instead of debating numerically negligible alternatives.

Compile once with the best supported baseline, then perform physical validation. A compile self-check or x86 simulation is not board evidence; do not add simulation after successful compilation unless it resolves a specific uncertainty. The physical batch should compare task outputs with floating references and measure latency, throughput, temperature, and memory. When quality or performance fails, inspect one structured boundary, change one coherent cause, and re-run. Package the model, source, YAML, log, evaluator, and measurements with digests.

Provenance intervention flags refer to edits of the source model before conversion. Pure PTQ and compiler-generated graph, preprocessing, lowering, or quantized representations are Tier A and leave `graphChanged`, `weightsChanged`, and `retrained` false.
