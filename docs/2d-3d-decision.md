# 2D / 3D physics decision gate

`assessModelDimensionality` decides whether the calibrated Rapier2D model remains adequate or whether to build a separate, minimal 3D playground. These thresholds are project acceptance gates, not Japanese law, industry standards, or manufacturer specifications.

All seven measurements are required. Missing evidence returns `INSUFFICIENT_EVIDENCE`; it must never be interpreted as approval to keep 2D.

`BUILD_3D_PLAYGROUND` is returned when any condition is true:

- at least 1% of measured samples have absolute Z displacement over 2 mm;
- board or glass contact occurs for at least 1% of balls;
- reflection-angle MAE exceeds 5 degrees;
- START or OUT absolute rate error exceeds 0.02 (two percentage points);
- normalized passage-heatmap Jensen–Shannon divergence exceeds 0.05;
- a like-for-like 3D model improves HOLDOUT loss by at least 20%.

Otherwise the result is `KEEP_2D`. Every triggered condition is returned as an explicit reason code. All evidence values are finite and nonnegative; rates and errors use fractions, so 1% is `0.01`.

No 3D migration is authorized by this document alone. There is currently no observed Z-axis dataset in the repository, so Rapier3D integration and app migration remain intentionally unimplemented. If complete evidence triggers the gate, first build an isolated playground and compare the same frozen HOLDOUT dataset before changing production physics.
