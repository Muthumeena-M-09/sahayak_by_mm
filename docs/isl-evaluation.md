# ISL prototype evaluation — 2026-11-03

**Partially working.** A real custom ISL classifier was trained, exported and
tested in the browser. Live recognition remains disabled while quality and
real-user validation are incomplete.

## Dataset and experiment

- Source: genuine INCLUDE Indian Sign Language recordings represented by the
  official OpenHands pose release, CC BY 4.0. No ASL/BSL/generic gesture weights.
- 174 unique structurally valid clips: **113 train, 26 validation, 35 test**.
- Labels are publisher-provided; independent linguistic review is pending.
  Signer IDs are unknown, so **signer-independent accuracy is not established**.
- No identical landmark-content hashes cross splits; no conflicting labels or
  corrupted selected clips were retained. No verified negatives were available;
  unrelated ISL words were not arbitrarily relabeled unknown.
- The original published test partition is retained. Training recordings are
  deterministically split into train/validation with seed 42. Training does not
  inspect the test set. Downloaded only 23,536,055 range bytes, reusing audit cache.
- [Machine-readable source manifest](isl-results/dataset-manifest.json) contains
  source paths, content hashes, per-class counts, splits and review limitations.
  It contains metadata, not pose/video arrays.
- Model: two temporal Conv1d layers (225→64→64, kernel 3), ReLU, temporal average
  pool, 10-way linear head. Fixed 32×225 input; xyz/shoulder normalization is the
  same in Python and TypeScript. Adam, reproducible seed, validation-loss checkpoint
  selection, early stopping after 35 epochs without improvement (106 epochs run).

## Held-out results

Overall on this small recording-disjoint set: **32/35 correct, 91.43%**. This does
not establish population, signer-independent or live-camera accuracy. Confidence
is uncalibrated softmax, not probability of being correct.

| Actual source sign | Correct / tested |
| --- | ---: |
| Hello | 4 / 4 |
| Thank you | 4 / 4 |
| School | 4 / 4 |
| Hospital | 4 / 4 |
| Money | 3 / 3 |
| Medicine | 3 / 3 |
| Doctor | 1 / 3 |
| Bank | 4 / 4 |
| Paper | 3 / 3 |
| Letter | 2 / 3 |

Two Doctor clips were classified as Bank; one Letter clip as Paper. One wrong
Letter prediction had .993 softmax, illustrating why a confidence threshold is
insufficient. [Evaluation JSON](isl-results/evaluation.json) contains every actual
and predicted label, confidence, complete confusion matrix, per-class metrics and
CPU timing. [Summary](isl-results/summary.json) gives confidence distribution and
artifact sizes. [Training history](isl-results/training-log.json) records epochs.
The .85 runtime threshold is provisional, not a validated unknown-rejection gate.

## Numerical and browser validation

- PyTorch→ONNX: all 35 held-out clips matched within `rtol=1e-4, atol=1e-4`;
  maximum absolute logit error `5.7220458984375e-6`.
- Actual ONNX Runtime Web WASM in local Chrome: **35/35 reference top-1 matches**,
  maximum absolute logit error `5.7220458984375e-6`.
- TypeScript vs Python preprocessing on three genuine unnormalized sequences:
  maximum difference `1.9073486328125e-6`.
- Real worker inference returned Hello for the real first held-out Hello sample.
- Browser inference required no external runtime/model requests. Camera and
  landmarks are never sent to Express, Gemini or Supabase.
- [Browser measurements](isl-results/browser.json) include user agent, model-load
  latency and every measured forward-pass time. This is one desktop device,
  classifier-only timing, not mobile or full camera-pipeline performance.

The cached pose extractor and the browser MediaPipe version are not identical
releases. Mathematical preprocessing parity on arrays does not demonstrate
cross-version extraction equivalence. Live user camera testing remains required.

Runtime camera check: real MediaPipe WASM/WebGL assets initialized locally and
processed synthetic camera frames, with no external camera-data requests. This
is a software/runtime check, not an ISL-user camera accuracy result. All nine
browser tests and all 40 existing/new unit tests pass. The live Gemini check
accepted the authenticated request but returned a service-unavailable SSE error;
see [live result](isl-results/live-chat.json).

## Release decision

`VITE_ENABLE_ISL_ASSIST` defaults false and the actual model manifest additionally
has `recognitionEnabled: false`. Doctor performance, missing unknown/no-sign
evaluation, unreviewed labels, unknown signer splits and absent real-camera ISL
validation prevent enabling. The UI still offers private camera preview and
editable confirmed-text fallback through the existing chat composer.

No runtime model is falsely presented as unrestricted sentence translation. No
fake results, generated negatives, or OpenHands checkpoint predictions are used.
