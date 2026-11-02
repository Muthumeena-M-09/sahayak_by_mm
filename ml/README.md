# Offline ISL fallback scaffold

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
inference on the device. The app currently has no model loader or placement path;
adding labels here does not enable supported signs in Sahayak.
