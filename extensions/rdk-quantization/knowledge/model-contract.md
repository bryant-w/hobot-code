# Model contract discovery

Record model digest, framework/format, graph inputs and outputs, static or dynamic shapes, dtypes, layouts, task semantics, output decoding, and source identity candidates. Graph resemblance alone does not prove a model name. An exact source match must agree on identity/version, task, tensor contract, and preprocessing. Variant and family sources cannot silently define model-specific values.

Validation storage layout is independent of model tensor layout. Inspect one sample's byte count and spatial/channel statistics before reshaping all data. A useful evaluator verifies one sample and the total file count before a batch run.
