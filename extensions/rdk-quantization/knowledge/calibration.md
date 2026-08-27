# Calibration domain

Establish calibration file count, dtype, shape, layout, color order, and numeric range. Distinguish the stored user domain, the floating model boundary, and the deployed runtime input representation.

For S-series `hb_compile`, calibration tensors are consumed at the floating model boundary; runtime mean/scale or color conversion fields do not automatically transform calibration files. Keep user data unchanged and create a generated calibration directory when transformation is required. Put the generated `.npy` tensors directly in the configured calibration directory, not in a nested featuremap folder. Confirm the rule against the exact model's calibration generator and compiler warnings.
