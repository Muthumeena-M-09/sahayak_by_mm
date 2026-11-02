# OpenHands INCLUDE ST-GCN audit and model recommendation

Audit started 2026-11-02, completed 2026-11-03 (Asia/Calcutta).
**Neither audited checkpoint passes recognition validation for
Sahayak. Do not integrate either model.** The ST-GCN model executes on Windows and
exports to ONNX with verified CPU numerical parity, but correctly classifies only
6 of 24 preselected test clips. This is a small, targeted diagnostic panel, **not
an estimate of overall model accuracy**. Frontend/backend source and configuration
are untouched. No training occurred.

## Provenance, vocabulary and license

- Real download: [include_stgcn.zip](https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_stgcn.zip),
  32,294,362 bytes. Observed SHA-256:
  `bf79d52c168c5db98ad6c403846abd8712241eae7f5f1d40233eb3eae8c9346e`.
  It contains `include/st_gcn/epoch=215-step=23543.ckpt` (35,292,747 bytes)
  and `include/st_gcn/config.yaml`. There is no bundled checkpoint license file.
- The actual [bundled config](../ml/openhands-audit/stgcn-config.yaml) names
  `INCLUDEDataset`, `train_include.csv`, `test_include.csv` and INCLUDE pose files.
  The [publisher's checkpoint catalog](https://github.com/AI4Bharat/OpenHands/blob/main/docs/_static/checkpoints.csv)
  links this artifact under INCLUDE, not ASL or a generic gesture dataset. This
  verifies published ISL training provenance, not an independently observed training
  run or a linguistic audit by an ISL signer.
- The weight tensors have 263 classifier outputs and 54 input batch-normalization
  features (27 xy joints). All **172 state-dict entries loaded strictly**, with
  no missing or unexpected keys. Config-generated graph adjacency exactly equals
  the checkpoint's stored adjacency. Parameter count: **2,927,975**.
- [Complete zero-based class mapping](../ml/openhands-audit/vocabulary.json):
  263 word classes, sorted exactly as the released train CSV. Test CSV labels
  contain spaces; stripping spaces confirms identical class-index order across
  both splits. Number prefixes are part of source labels, not class IDs. Do not
  sort cleaned translations or renumber by the prefix. This mapping is the
  documented release contract; an independently authenticated training-time map
  embedded in the weights was not available.
- Source [Apache 2.0 license](https://github.com/AI4Bharat/OpenHands/blob/checkpoints_v1/LICENSE.txt)
  permits use subject to its redistribution, attribution and modification notices.
  The [Zenodo pose-record API](https://zenodo.org/api/records/6674324) reports
  `cc-by-4.0` and open access (verified in the preceding audit). **The separately
  hosted weights' precise license coverage remains unresolved.** Confirm that
  coverage with the publisher before distributing weights with Sahayak. Do not
  conflate dataset licensing, source licensing and checkpoint licensing.

## Genuine samples and test method

The selection was frozen before inference: the first two distinct available clips
in the publisher's test CSV for each of 12 predeclared service-related classes.
All 24 were fetched from the official
[INCLUDE pose release](https://zenodo.org/records/6674324) through HTTP 206 byte
ranges. Total dataset transfer: **4,088,715 bytes**, within an 8 MB cap; the full
662,887,244-byte archive was not downloaded. Every fetched ZIP member passed its
CRC/length check; SHA-256 and source paths are retained in
[samples-provenance.json](../ml/openhands-audit/samples-provenance.json).

These are genuine **released landmark sequences** associated with ISL videos,
not synthetic poses. Raw video, camera capture and new MediaPipe extraction were
not tested. No selected path appears in the released train CSV, and the 24 sample
hashes are distinct. Signer identity/disjointness is **unverified**. Other train
clips were not downloaded to check cross-split content duplicates. The original
release CSVs contain no conflicting path-to-label mappings; earlier HF-preview
conflicts were not reproduced in these primary metadata files.

Baseline: one complete clip per forward pass; all models in eval mode, CPU,
two PyTorch threads; no label filtering to the 12 chosen classes. Prediction is
argmax across **all 263 outputs**. Labels are compared after whitespace
normalization only. Every reported confidence is an **uncalibrated softmax score**,
not probability of correctness. Highly confident mistakes occurred.

Results and per-class details: [stgcn-results.json](../ml/openhands-audit/stgcn-results.json).
The table below is generated from that record; percentages are rounded.

| Actual label | Clip | ST-GCN prediction (softmax) | BiLSTM prediction (softmax) |
| --- | --- | --- | --- |
| 48. Hello | MVI_0029.MOV | 53.Orange (100.0000%) | 65.Season (100.0000%) |
| 48. Hello | MVI_9914.MOV | 53.Orange (86.5414%) | 65.Season (99.2182%) |
| 55. Thank you | MVI_9948.MOV | 78.Year (99.9037%) | 40.Skirt (92.7410%) |
| 55. Thank you | MVI_0111.MOV | 9.Technology (99.8030%) | 40.Skirt (96.0901%) |
| 24. School | MVI_3536.MOV | 24.School (99.9901%) | 40.Skirt (98.5574%) |
| 24. School | MVI_3292.MOV | 24.School (100.0000%) | 40.Skirt (58.3452%) |
| 30. Hospital | MVI_3481.MOV | 27.Dream (70.0188%) | 68.Family (57.7365%) |
| 30. Hospital | MVI_3639.MOV | 51.Clock (95.0748%) | 36.Soap (77.3509%) |
| 4. Money | MVI_8669.MP4 | 19.Ball (96.0451%) | 7.Horse (43.8226%) |
| 4. Money | MVI_4265.MOV | 50.Yellow (100.0000%) | 41.you (90.7922%) |
| 3. Medicine | MVI_4805.MOV | 1.Religion (57.3642%) | 60.Radio (74.7186%) |
| 3. Medicine | MVI_8934.MP4 | 78.Year (99.2592%) | 4.Bird (99.9667%) |
| 87. Doctor | MVI_4471.MOV | 51.Clock (99.9656%) | 3.Fish (100.0000%) |
| 87. Doctor | MVI_8875.MP4 | 87.Doctor (96.7224%) | 51.Brown (90.0358%) |
| 35. Bank | MVI_3421.MOV | 29.clean (84.6507%) | 40.Skirt (99.8992%) |
| 35. Bank | MVI_3422.MOV | 29.clean (87.3738%) | 20.Price (99.8255%) |
| 42. Paper | MVI_4422.MOV | 2.Cat (86.4762%) | 6.Mouse (53.7754%) |
| 42. Paper | MVI_9059.MP4 | 2.Cat (51.3094%) | 6.Mouse (99.9855%) |
| 41. Letter | MVI_4931.MOV | 42.Paper (97.9493%) | 16.Gun (99.6700%) |
| 41. Letter | MVI_8823.MP4 | 41.Letter (100.0000%) | 27.Dream (99.9996%) |
| 25. Office | MVI_3541.MOV | 53.Orange (63.2934%) | 39.Key (97.0937%) |
| 25. Office | MVI_3676.MOV | 74.Queen (65.7985%) | 65.Season (99.9826%) |
| 92. Police | MVI_4775.MOV | 92.Police (99.9999%) | 80.Adult (99.6506%) |
| 92. Police | MVI_5348.MOV | 92.Police (99.9942%) | 84.Teacher (99.9898%) |

## Exact preprocessing and architecture

The bundled validation pipeline is **PoseSelect → CenterAndScaleNormalize**:

1. Input dictionary: `keypoints[T,75,3]`, ordered as 33 body joints, 21 left-hand
   joints, 21 right-hand joints; `confidences[T,75]` accompanies it. Coordinates
   originate from upstream MediaPipe Holistic. Keep **xy only**; ignore z and
   confidence for this checkpoint. Convert float32, permute to `[2,T,75]`.
2. Select indices
   `[0,2,5,11,12,13,14,33,37,38,41,42,45,46,49,50,53,54,58,59,62,63,66,67,70,71,74]`.
3. Subtract the **clip-average** shoulder midpoint and divide by **mean xy shoulder
   distance across the clip**. Selected shoulder indices are 3/4. Upstream falls
   back to no normalization when reciprocal mean distance is infinite. None of
   the 24 clips had zero shoulder distance or nonfinite normalized input.
4. Preserve full clip length. There is **no fixed 32-frame resampling** in this
   checkpoint config. No training shear/rotation applies during inference.
   Model input is `[N,2,T,27]`; output is `[N,263]`. Our test has T=49–80.

ST-GCN uses a 27-node graph with distance partitioning (adjacency shape `[2,27,27]`),
10 graph/temporal blocks, temporal kernel 9, strides of 2 at two stages, learned
edge importance, 256-dimensional pooled embedding, dropout .05 and a linear head.
The exact 26 graph edges are retained in the config. No weights were fine-tuned.

For this audit, only the source modules needed for inference were extracted from
the pinned release-tag source ZIP. Two **configuration-only** lines in its local
ST-GCN vendor copy were changed: remove the OmegaConf import and conversion, since
PyYAML already supplies a plain graph dictionary. No model tensor operation or
weight was changed for the reported PyTorch predictions. The source license is
copied alongside vendor files; their hashes are recorded in the results JSON.

## Implementation and preprocessing investigations

- **Batch/time ordering:** ST-GCN consistently uses NCTV and does not exhibit the
  BiLSTM's sequence/batch confusion. In a two-clip diagnostic, ST-GCN's maximum
  companion-related logit difference was about `3.05e-5`, and swapping batch order
  changed its logits by zero. BiLSTM differences were about **33.67** and **34.88**.
- **Padding matters:** upstream collation zero-pads to the longest clip without a
  length mask. Padding this panel to 80 frames and evaluating it as one batch left
  ST-GCN at 6/24, but changed two predicted labels. BiLSTM changed **all 24 labels**
  and scored 15/24 in that batch versus 0/24 alone. The latter is a diagnostic of
  cross-clip dependence, not evidence of reliable single-stream recognition.
- **Missing hands:** at least one hand has missing frames in every selected clip;
  one Money clip has no detected left hand in all 66 frames. Upstream normalization
  transforms zero-filled missing coordinates into nonzero normalized coordinates,
  and this checkpoint receives no visibility mask. That is a robustness concern,
  not proof that missing hands explain every error. Both School clips were correct
  despite missing hand frames.
- **No rejection class:** an all-zero diagnostic input still produces a word
  prediction (ST-GCN: Afternoon, softmax .273). This artificial diagnostic is not
  counted among genuine-sample accuracy. A deployment needs quality/visibility
  checks and unknown/no-sign rejection, not softmax thresholding alone.
- **Upstream version comparison:** downloaded current `PoseSelect`,
  `CenterAndScaleNormalize`, `ConvTemporalGraphical`, `STGCN_BLOCK` and `STGCN`
  classes are AST-identical to the release versions after ignoring docstrings.
  [Comparison hashes/results](../ml/openhands-audit/source-comparison.json).
  Current dataset code has multilingual/label-helper changes, but no alternative
  documented preprocessing was found that justifies changing the baseline.
- **What remains unexplained:** strict loading, adjacency, dimensions and the
  documented label ordering pass. Those checks do not prove the weights were
  trained with exactly the preprocessing/metadata published later. Regional
  signing variation, pose quality, undocumented training differences or model
  quality may contribute. No root cause for all ST-GCN errors is established.
  Do not tune the label mapping or preprocessing on this panel to inflate its score.

## ONNX conversion and React feasibility

With permission, installed **only `onnx==1.19.1`** (16.5 MB wheel) into a local
audit virtual environment with system-site-packages access. Existing PyTorch
2.8.0+cpu, NumPy 1.26.4, PyYAML and ONNX Runtime 1.24.2 were reused. Sahayak's
package files and Python global packages were not modified.

The first dynamic-frame export failed: upstream `avg_pool2d(x, x.size()[2:])`
creates a dynamic kernel size that the legacy exporter requires to be constant.
The export-only wrapper substitutes mathematically equivalent
`x.mean(dim=(2,3), keepdim=True)` for that final global pool. No retraining, input
change or classifier change was involved. Original PyTorch remains the reference.

- Export: **passed**, opset 17, batch fixed at 1, dynamic frame dimension.
- ONNX checker: **passed**.
- ONNX Runtime CPU comparison: **passed all 24 real samples**, all 263 logits per
  sample within `rtol=1e-4`, `atol=1e-4`; identical top-1 on every sample.
- Maximum absolute logit difference: **0.00008392333984375**.
- Output file: `ml/openhands-audit/artifacts/include-stgcn.onnx`, **11,779,899 bytes**.
- SHA-256: `eaba189075b9175177c1cf4beed7efce87fabe168eaf348f4c69cfca1ab5dfdb`.
- Graph operators: Add, BatchNormalization, Cast, Concat, Constant, Conv, Div,
  Einsum, Gather, Gemm, Mul, ReduceMean, Relu, Reshape, Shape, Transpose, Unsqueeze.

**React/TypeScript compatibility is plausible, not browser-validated.**
[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) offers a JavaScript
API and broad WASM operator support. These operations are appropriate for a
future WASM test; that alone does not prove this exported graph runs in a browser.
WebGPU has a narrower operator set and needs separate validation. No browser
runtime download or test was performed, per the user's choice. No promise about
mobile performance, memory or worker compatibility is made.

A future standalone browser parity test would load the local ONNX and local
runtime/WASM files, create float32 `[1,2,T,27]` tensors after identical
preprocessing, and compare all logits to saved real-sample fixtures. Landmark
processing must stay local. Numeric parity does **not** improve recognition:
ONNX correctly reproduces the checkpoint's wrong answers.

## Comparison and recommendation

| Criterion | BiLSTM | ST-GCN |
| --- | --- | --- |
| Published training provenance | INCLUDE ISL | INCLUDE ISL |
| Output vocabulary | Same 263 classes | Same 263 classes |
| Parameters | 1,638,407 | 2,927,975 |
| Single-clip panel result | 0/24, 0% | 6/24, 25% |
| Padded 24-clip batch diagnostic | 15/24; all labels change | 6/24; 2 labels change |
| Independent-stream behavior | Defective batch/sequence ordering | No analogous defect found |
| ONNX CPU parity | Not retested in this audit | Passed on 24 genuine sequences |
| Recognition approved for Sahayak | **No** | **No** |

ST-GCN is the stronger architecture to investigate further, but neither released
checkpoint is suitable for integration on this evidence. We have not set a
production threshold after seeing these scores; both fail basic diagnostic
examples and remain without live-user or unknown-sign validation. Do not promise
the six correctly classified clips generalize to their entire classes.

## Smallest practical custom prototype proposal — not trained

Use local MediaPipe body/hands landmarks followed by a small **temporal 1D CNN**,
not a static generic-gesture model. Start with **10 audited ISL word classes plus
an explicit unknown/no-sign class**. Possible labels already present in INCLUDE:
Hello, Thank you, School, Hospital, Money, Medicine, Doctor, Bank, Paper and Letter.
These are candidates for ISL-user review and data audit, not supported signs of a
working custom model. Replace any label whose available data is inadequate.

Proposed input: 32-frame segmented clips, 7 upper-body landmarks plus all 21
landmarks from each hand (49 joints); xy plus a validity feature per joint = 147
features/frame. Keep missing-point masks, normalize using valid shoulders, and
preserve handedness. A deliberately small candidate is:

```text
[1,147,32]
Conv1d(147 -> 32, kernel 5) + ReLU
Conv1d(32 -> 32, kernel 3, dilation 2) + ReLU
Conv1d(32 -> 32, kernel 3, dilation 4) + ReLU
Temporal mean -> Linear(32 -> 11)
```

With biases this is **30,123 parameters**, about **120 KB of FP32 weights**,
excluding ONNX overhead. This is a design calculation, not a measured model size
or accuracy result. MediaPipe assets/runtime will dominate total download size.
Begin with a user-controlled sign window; continuous segmentation is a separate
challenge. Choose fixed 32-frame input for a straightforward ONNX graph; verify
that resampling retains the movement needed to distinguish chosen signs.

Train only after approval on a licensed, manually reviewed ISL subset, with
signer-disjoint train/validation/test data and unknown/transition/no-hands
examples. Audit near-duplicate videos and labels. Calibrate rejection on validation
data; evaluate held-out per-class recall, false acceptance, and multiple ISL users
across lighting/background/speed variations. Hands/body features may miss facial
or fine motion distinctions; remove ambiguous signs or expand features if
evaluation requires it. Keep all camera/landmark inference on-device and require
text confirmation before using existing chat. No accuracy is promised.

Existing `ml/train_isl.py` is an earlier generic fallback preparation script;
it does **not** implement this 49-joint/mask/unknown-class proposal unchanged.
Implement its extraction, split checks, classifier and browser-parity evaluation
as a separate approved next phase. No custom training has started.

## Reproduction commands

From `D:\hackathon\sahayak_by_mm` (network/download commands were approved):

```powershell
curl.exe -f -L --max-time 90 --max-filesize 33000000 -o ml/openhands-audit/artifacts/include_stgcn.zip https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_stgcn.zip
python ml/openhands-audit/fetch_samples.py
python -m venv --system-site-packages ml/openhands-audit/artifacts/onnx-env
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe -m pip install --disable-pip-version-check --no-deps onnx==1.19.1
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe ml/openhands-audit/audit_stgcn.py --export
```

Existing BiLSTM/metadata/release-source files from the preceding audit are required;
their URLs/hashes are in [the BiLSTM report](openhands-include-audit.md). Binary
artifacts, sample poses, virtual environment, logs and vendor copies remain local
under ignored paths. Audit code, provenance, config and results are committed.
The exporter prints a large diagnostic graph for its expected initial failure;
the subsequent equivalent-pooling export and all parity checks pass.

A current-source archive fetch was aborted by its 2 MB transfer cap. Three small
raw source files were then fetched for the version comparison. No full current
source archive was used, no extra model was downloaded, and no data was uploaded.
