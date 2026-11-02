# Offline ISL fallback scaffold

## INCLUDE checkpoint conversion

The approved follow-up investigates the genuine ISL 263-class small transformer.
Research assets and generated models stay in ignored local folders, outside public
web assets until explicitly staged with `npm run isl:prepare`. An experimental
camera screen is now available; see [local testing](../docs/isl-testing.md).

```powershell
python ml/fetch_include.py
python -m pip install --target ml/.deps --no-deps --only-binary=:all: onnx==1.20.1
python ml/validate_include.py
```

The validation environment also needs PyTorch, NumPy, Transformers, ONNX Runtime,
protobuf and ml_dtypes. The exact versions from a successful run are recorded in
`ml/output/include/conversion-report.json`. This is a research environment, not an
addition to the application's npm dependencies.

The fetcher downloads only public artifacts, pins source by commit and checks the
checkpoint and model-source SHA-256 before use. The exporter uses restricted
weights-only loading, strict state-dict matching, ONNX schema checking and four
numerical parity probes. Its two source adaptations fix the old BertLayer import
and turn final dropout off during evaluation. This changes upstream evaluation
behavior and requires fresh accuracy measurement.

The output is fixed at `[1,169,134]`, with 263 raw logits in the upstream label
order. Never narrow logits to a chosen subset before determining the full-model
winner: that would turn unrelated signs into apparently supported ones. No unknown
class or calibrated rejection threshold is supplied. Synthetic parity probes do
not measure ISL recognition accuracy, and CPU ONNX Runtime is not a browser test.

See the follow-up section in the model validation document for licensing and
legacy landmark constraints before attempting a browser adapter.

## Training fallback

No trained model or dataset is included. Read
[Phase 1 findings](../docs/isl-model-validation.md) before proceeding.
Training, export parity and browser inference have not been validated.

Use a separate Python environment with NumPy, PyTorch and ONNX installed; record
the versions used with any resulting artifact. This script performs no downloads.

Prepare a licensed ISL dataset locally with a dataset-specific landmark extractor.
Store numeric `x_train`, `x_val`, `x_test` arrays in an NPZ, each shaped
`[clips, fixed_frames, features]`. Features must include consistent left/right
hands and pose context, normalized coordinates and missing-point masks. Include
integer `y_*` arrays and string `signer_*` arrays, one entry per clip. Signer groups
must be disjoint across all three partitions. Every label must occur in each split.
Do not put these private arrays or videos in Git or the public asset directory.

Supply a JSON manifest with `dataset_source`, `dataset_license`, `preprocessing`
(extractor/version, landmark order, normalization, sampling and mirror policy),
and `labels` (10–20 verified dataset label strings in output-index order).
Manifest completeness is not proof of licensing or linguistic validity.

```powershell
python ml/train_isl.py path/to/landmarks.npz path/to/manifest.json path/to/private-output
```

The script chooses weights by validation loss, evaluates the test split once and
exports logits to `model.onnx`, plus a manifest and measured evaluation JSON.
Repeated test-driven tuning invalidates the held-out estimate. Confidence
thresholds must be calibrated on validation data and non-sign examples separately.
The closed-set classifier alone cannot reject unknown signs reliably.

Before deployment compare ONNX and PyTorch outputs, record artifact hashes,
measure per-sign precision/recall and false activations, and evaluate with multiple
ISL users under varied lighting, backgrounds and signing speeds. Keep all camera
inference on the device. The current app loader accepts only the verified INCLUDE
artifact hash; a newly trained fallback requires a separately validated adapter,
manifest and preprocessing contract. Adding labels alone does not train new signs.
