# RDK classification PTQ runtime Skill

Use this optional Skill only after live inspection proves all preconditions in `bundle://skills/index.json`. The executor materializes its digest-bound files at `$HOBOT_SKILLS_ROOT` on the x86 endpoint. Check the variable and directory once. If either is absent or the task is not covered, continue with native commands; do not emulate a missing Skill with a large inline program.

The scripts report facts or perform explicit mechanics. They do not choose preprocessing, YAML fields, retry policy, acceptance, or outcome. The Agent owns those decisions and writes the complete conversion YAML. The command contracts below are complete: do not call these scripts with `--help`, and do not recreate their behavior with inline Python.

## Short path

1. `config_audit.py inspect` itself is safe before the classification preconditions are known. Use it as the first x86 model/data probe; do not first duplicate its file counts, ONNX graph inventory, or digest work with shell snippets. Probe the native compiler version/help once in the same stage and do not repeat it later.

```bash
python3 "$HOBOT_SKILLS_ROOT/config_audit.py" inspect --model MODEL --dataset CALIBRATION --output quantization/inspect.json
```

2. Read the relevant board template and exact official source. Write the full YAML at an Agent-selected path, then inventory every leaf without rewriting it:

```bash
python3 "$HOBOT_SKILLS_ROOT/config_audit.py" validate --config CONFIG --output quantization/config-audit.json
```

3. If live evidence says compiler calibration input needs a numeric transform, create a separate generated directory. Select `identity`, `mean`, `scale`, or `mean-scale` and provide the values explicitly:

```bash
python3 "$HOBOT_SKILLS_ROOT/calibration_prepare.py" --input-dir INPUT --output-dir OUTPUT --channels CHANNELS --dtype DTYPE --operation OPERATION --mean MEAN --scale SCALE
```

4. For a manifest-based classification evaluator, generate runtime inputs, bind data contracts, and compute the FP32 reference. All shape, layout, and preprocessing values are explicit Agent inputs:

```bash
python3 "$HOBOT_SKILLS_ROOT/runtime_validation.py" --manifest VALIDATION_MANIFEST --output quantization/runtime-validation.tar --target TARGET --width WIDTH --height HEIGHT
python3 "$HOBOT_SKILLS_ROOT/classification_contracts.py" --validation-manifest VALIDATION_MANIFEST --runtime-archive quantization/runtime-validation.tar --output-dir quantization/contracts --input-name INPUT --height HEIGHT --width WIDTH --storage-layout HWC --model-layout NCHW --source-dtype uint8 --mean MEAN --scale SCALE
python3 "$HOBOT_SKILLS_ROOT/classification_reference.py" --model MODEL --manifest VALIDATION_MANIFEST --data-root VALIDATION_ROOT --output quantization/fp32_ref.npz --height HEIGHT --width WIDTH --channels CHANNELS --storage-layout HWC --layout NCHW --source-dtype uint8 --mean MEAN --scale SCALE --data-contract quantization/contracts/validation-rgb.json
```

For `runtime_validation.py`, `TARGET` is `x5` or `s-series`. For `config_audit.py package`, `PLATFORM` is `x5`, `s100`, or `s600`. Do not pass `s-series` to the package command. These commands are inapplicable to detection, segmentation, multi-input, dynamic-shape, non-image, or evaluator-unknown tasks.

5. Run the native compiler directly with the Agent-authored YAML. Do not hide compiler output. After success, package only measured inputs and provenance:

```bash
python3 "$HOBOT_SKILLS_ROOT/config_audit.py" package --platform PLATFORM --workspace quantization --artifact ARTIFACT --model MODEL --config CONFIG --log LOG --runtime-archive quantization/runtime-validation.tar --board-helper "$HOBOT_SKILLS_ROOT/board_validate.py" --reference quantization/fp32_ref.npz --contracts-dir quantization/contracts --output quantization/board-package.tar
```

6. Transfer that archive with `file_copy`, then run one board batch. This helper itself verifies the first physical output, executes the labeled accuracy/fidelity batch, runs `hrt_model_exec perf`, samples temperature before and after, and writes `delivery/metrics.json`. Do not add a separate single-sample inference, helper inspection, performance command, or thermal monitor unless the returned diagnostic explicitly reports a missing boundary:

```bash
tar -xf board-package.tar && python3 delivery/board_validate.py --platform PLATFORM --bundle board-package.tar --work-dir . --warmup 10 --iterations 100
```

7. Transfer `delivery/metrics.json` back. The Agent decides whether to accept, retry with a changed YAML, or stop. For finalization, write a small decision JSON containing exactly `outcome`, `modificationTier`, `retrained`, and `limitations`. `outcome` is `success`, `partial`, or `failed`; `modificationTier` is exactly `A`, `B`, or `C`; `retrained` is boolean; `limitations` is a string array. Then generate schema-bound files:

```bash
python3 "$HOBOT_SKILLS_ROOT/report_finalize.py" --metrics METRICS --decision DECISION --expected-source MODEL --output-dir quantization --worker-root WORKSPACE_ROOT
```

Never use these measurements as the independent Judge. They are user-visible evidence for the Agent's decision; Harness admission remains separately measured.
