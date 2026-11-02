# ISL training and prototype

A real 10-class classifier has now been trained on 174 INCLUDE pose recordings.
It scored 32/35 on the small recording-disjoint test set and passed browser/Worker
inference parity. Live recognition remains disabled: unknown rejection, signer
independence and real-user camera accuracy are unverified, and Doctor scored 1/3.
See [implementation/setup](../docs/isl-implementation.md) and
[evaluation](../docs/isl-evaluation.md) for exact reproduction commands and results.
Local trained assets are under `ml/runs/prototype-v1` and `public/models/isl`.
Data, poses and model binaries are ignored by Git.

`prepare_isl.py` and `isl_preprocessing.py` implement preparation/normalization;
the mathematical browser counterpart is `src/lib/isl/preprocessing.ts`.
Use `--allow-unknown-signers` only with `signer_independent: false` to explicitly
permit recording-disjoint experiments. Signer IDs remain empty, never invented.

## Original preparation contract

The following design notes were written before implementation. Extraction and
the local ONNX adapter now exist; authoritative current commands, flags and
limitations are in the implementation/evaluation documents linked above.

These scripts train an experimental classifier; datasets and weights stay local.
Measured results are in the evaluation report. Python 3.11+ is
recommended. Install `pip install -r ml/requirements.txt` in a local virtual
environment when the model path is approved; no paid services are required.

Acquire the original licensed ISL videos locally, retain attribution, and have
an ISL user audit 10–20 service-relevant word classes. Resolve conflicting labels
and duplicate files first. Record dataset version, hashes and consent/license
evidence. Never commit participant videos or landmark arrays.

Prepare three NPZ files with `allow_pickle=False` compatible arrays:

- `x`: finite float32 `[N,32,225]` temporal features.
- `y`: integer `[N]`, zero-based indices into manifest labels.
- `signer_id` and `clip_id`: nonempty Unicode `[N]` arrays. Clip IDs must identify
  original recordings, including every derived window or augmentation.

Implemented `holistic75-shoulder-v1` preprocessing:
unmirrored camera coordinates; MediaPipe pose indices 0–32, left hand 0–20,
right hand 0–20; xyz in that order. For each frame subtract the midpoint of pose
shoulders 11/12 and divide by their xy distance. Zero missing landmarks after
normalization; reject clips without visible shoulders or with near-zero scale.
Uniformly resample a deliberately segmented sign to 32 frames by linear
interpolation, then flatten joints/xyz. Pin the same MediaPipe model/version,
coordinate conventions and missing-point handling in extraction and browser code.
This is a proposed contract, not compatibility with OpenHands preprocessing.

Use signer-disjoint train/validation/test partitions; every class must occur in
each partition. Do not invent signer IDs when source identity is unavailable:
collect a consented signer-disjoint evaluation set before claiming generalization.
Deduplicate source content by hash before assigning IDs. Augment training only.

Supply a JSON manifest with `language: "ISL"`, `source` (exact version/URL),
`license`, `audited: true`, and `labels` (10–20 audited source label strings in
class order). The audit boolean is an operator assertion, not automated proof.
Do not use example labels as if a trained model supported them.

```powershell
python ml/train_isl.py --train local/train.npz --validation local/validation.npz --manifest local/dataset.json --out local/isl-run
python ml/evaluate_isl.py --model local/isl-run/model.onnx --manifest local/isl-run/manifest.json --test local/test.npz
```

Training selects checkpoints using validation accuracy and checks one exported
ONNX sample against PyTorch. Evaluation reports measured overall/per-sign accuracy
and a confusion matrix; it rejects signer/clip overlap with training/validation.
Neither script certifies linguistic correctness or browser suitability. Test
export parity across the full held-out set and target browser separately. Closed-set
accuracy does not measure false positives on unknown signs or live segmentation.
Add background/no-sign examples, rejection calibration, timing and multiple-user
camera evaluation before deployment.

The publisher places experimental artifacts under `public/models/isl/` with
hashes, attribution and label map. The browser adapter and Worker load them
locally, while the normal UI keeps recognition disabled pending validation.
Adding a sign requires new audited data, retraining, held-out evaluation and an
updated multilingual UI mapping; editing a label file alone cannot teach a sign.
