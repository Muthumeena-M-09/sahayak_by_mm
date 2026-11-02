# OpenHands INCLUDE checkpoint audit

Date: 2026-11-02. **Real inference executes locally, but the tested BiLSTM is not
approved for Sahayak recognition.** No app, environment configuration or frontend
dependencies were changed. No training or dependency installation was performed.

## Results against the seven requested checks

| Check | Evidence / result |
| --- | --- |
| Downloadable pretrained weights | **Yes.** Direct GET retrieved `include_lstm.zip`, 18,777,287 bytes; ZIP contains `include/lstm/epoch=294-step=63719.ckpt` (19,689,205 bytes) and `config.yaml`. Metadata ZIP is 47,041 bytes. Strict state-dict loading passed. |
| Trained for Indian Sign Language | **Verified from release/config provenance.** The bundled config uses `INCLUDEDataset`, INCLUDE train/test CSVs, and pose data. Creator's dataset implementation identifies Indian sign language (`ins`). This verifies the published training claim, not an independent retraining audit. |
| Vocabulary | **263 output classes**, matching the original train metadata; [full index-ordered vocabulary](../ml/openhands-audit/vocabulary.json). The test labels have extra spaces, but all 263 indices match after removing spaces. Not an alphabet model. Output classes do not imply reliable recognition. |
| Local Windows inference | **Executed on CPU**, Python 3.11.8, PyTorch 2.8.0+cpu, NumPy 1.26.4. Genuine released Hello pose sample produced finite `[1,263]` logits. Top-1 was **Season**, incorrect. |
| ONNX / React | **Not verified.** `infer.py --export` recorded `ModuleNotFoundError: No module named 'onnx'`. Nothing installed. Architecture uses ordinary LSTM, linear, tensor and attention operations, so export is plausible, but numerical and browser parity have not passed. |
| Preprocessing/dependencies/files | Exact contract and minimal test below. The full OpenHands training stack is unnecessary for this isolated pose-inference test. Raw camera/video extraction remains untested and needs MediaPipe. |
| License for Sahayak | Repository source is Apache 2.0, allowing use/distribution subject to notices, license copy and modification notices. Zenodo pose record metadata explicitly says CC BY 4.0, open access. **Checkpoint-specific license scope remains unconfirmed**: the downloaded weight bundle has no license file; do not assume the code license automatically covers separately hosted weights. Confirm with the publisher before production redistribution. |

Primary sources: [checkpoint catalog](https://github.com/AI4Bharat/OpenHands/blob/main/docs/_static/checkpoints.csv),
[INCLUDE implementation](https://github.com/AI4Bharat/OpenHands/blob/main/openhands/datasets/isolated/include.py),
[source license](https://github.com/AI4Bharat/OpenHands/blob/checkpoints_v1/LICENSE.txt),
[pose release](https://zenodo.org/records/6674324),
[pose record API](https://zenodo.org/api/records/6674324).
License statements above describe inspected terms; checkpoint permission is unresolved.

## Genuine sample and observed inference

Sample: `Pose_Signs/Greetings/48. Hello/MVI_0029.pkl`, corresponding to
`Greetings/48. Hello/MVI_0029.MOV` in the published test split. This is a genuine
released landmark sequence, **not a raw-video extraction test**, and is not a
fabricated pose array. Only 796,721 bytes were fetched via HTTP 206 byte ranges
from the 662,887,244-byte dataset archive. No full dataset was downloaded. The
outer ZIP stores its nested pose ZIP uncompressed, enabling selective access.

The archive entry's length and CRC passed, and its SHA-256 is saved in
[sample-provenance.json](../ml/openhands-audit/sample-provenance.json). Full outer
dataset checksum was not verified because the complete archive was not fetched.
Signer-disjointness of the publisher's test partition has not been established.

Latest run (`python ml/openhands-audit/infer.py --export`):

```text
Strict weight loading: passed (no missing/unexpected keys)
Device: cpu
Input shape: [1, 2, 63, 27]
Output shape: [1, 263], finite
Expected: 48. Hello
Top 1: class 173, 65.Season, softmax 0.9999998807907104
Top 2: class 12, 13.Attack, softmax 4.3628649137872344e-08
Top 3: class 1, 1.Religion, softmax 3.082578459157048e-08
Top 4: class 139, 52.Goodafternoon, softmax 3.0623573121779657e-10
Top 5: class 137, 51.Clock, softmax 2.651392161379107e-10
Top 1 matches expected: false
First forward pass: 16.38 ms (earlier run 44.44 ms)
ONNX export/parity: blocked — No module named 'onnx'
Browser test: not run
```

Timing covers the classifier forward pass only, with two CPU threads; it excludes
imports, landmark extraction, normalization and camera capture. It is not a
latency benchmark. This one failed sample provides no overall accuracy estimate.
Softmax is not calibrated confidence: here an incorrect answer is near 100%.
Machine-readable output: [result.json](../ml/openhands-audit/result.json).

## Critical upstream BiLSTM behavior

Release-tag `RNNClassifier` calls `nn.LSTM` without `batch_first=True`, but
`PoseFlattener` emits `[B,T,54]`. PyTorch therefore interprets B as sequence length
and T as batch size. Attention then operates over the other ordering. This means
predictions can depend on other clips in a batch, and a single-clip run does not
model time as intended. Sources: [decoder](https://github.com/AI4Bharat/OpenHands/blob/checkpoints_v1/openhands/models/decoder/rnn.py),
[flattener](https://github.com/AI4Bharat/OpenHands/blob/checkpoints_v1/openhands/models/encoder/graph/pose_flattener.py),
[attention](https://github.com/AI4Bharat/OpenHands/blob/checkpoints_v1/openhands/models/decoder/utils.py).

The test keeps this released behavior exactly; it does not silently transpose or
set batch_first. Fixing inference alone changes the function learned during
training. The ordering defect is a concrete deployment concern; it has not been
proven to be the only cause of the observed misclassification. We did not measure
or adopt the paper's benchmark accuracy as application accuracy.

## Exact preprocessing and required files

1. Offline input is an upstream pose dictionary: `keypoints[T,75,3]` and
   `confidences[T,75]`. Ordering: 33 pose joints, 21 left-hand joints, 21 right-hand
   joints. The upstream extractor uses RGB video and legacy MediaPipe Holistic;
   face points are discarded. Missing points are zero-filled in extraction.
2. Keep **xy only**; confidence and z are not model input. Cast float32, transpose
   to `[2,T,75]`.
3. Select these 27 indices, exactly:
   `[0,2,5,11,12,13,14,33,37,38,41,42,45,46,49,50,53,54,58,59,62,63,66,67,70,71,74]`.
4. Subtract the **clip-average shoulder midpoint** (selected indices 3/4), multiply
   by reciprocal **mean shoulder xy distance** across the clip. Upstream skips
   normalization if reciprocal distance is infinite. This differs from the
   untrained fallback's proposed per-frame normalization.
5. Keep all frames: temporal sampling is commented out in the released config.
   Use `[1,2,T,27]`, flatten to `[1,T,54]` internally. Do not apply training shear
   or rotation transforms. Preview mirroring must not change inference coordinates.

The architecture is 4-layer bidirectional LSTM, hidden size 128, attention pooling,
263 logits. All modules used in the test are copied byte-for-byte from the source
tag into an ignored local `vendor/` directory with its Apache license. The small
wrapper avoids importing OpenHands' training stack and never loads unrestricted
checkpoint pickle. PyTorch's weights-only loader permits just two inert marker
classes used as old Lightning callback dictionary keys. The sample unpickler
permits only NumPy array reconstruction types; arrays are checked before inference.

Required existing files in `ml/openhands-audit/artifacts/`:

| File | SHA-256 |
| --- | --- |
| `include_lstm.zip` | `22e3b923fa066dd37c7ae44899fe00dacc737df61f00c730853b77f7ab58018d` |
| `include_metadata.zip` | `f4d229aaf56cc85266feb9d8526407513382113294dbe75fc3772f881d0fc6e3` |
| `source.zip` (release tag) | `297540715f2aefbca288da9f63ae16920ba34e7f0bc1d6e5074c063637302680` |
| `sample.pkl` | `b62eac05fbd1b50a05d912c84e20e1720156c89c09b1efd4b14c5beec79c4782` |

These are observed download hashes, not publisher-signed checksums. Binary assets
and vendor copies are ignored by Git. Minimal inference requires only installed
torch and numpy plus the standard library. Installed ONNX Runtime is 1.24.2.
Missing: onnx, mediapipe, pytorch-lightning, omegaconf, hydra-core, opencv-python.
Nothing was installed. Full upstream install would pull a broad research stack
including Lightning/Hydra, torchvision, transformers, OpenCV, MediaPipe and others;
its old API compatibility on current packages is not established.

## Commands executed / reproduction

Run from `D:\hackathon\sahayak_by_mm`. Network commands below require permission in
this environment. Files already exist locally; no re-download is needed to rerun
inference. These commands install nothing:

```powershell
python --version
curl.exe -I -L --max-time 30 https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_lstm.zip
New-Item -ItemType Directory -Force ml/openhands-audit/artifacts | Out-Null
curl.exe -f -L --max-time 60 --max-filesize 25000000 -o ml/openhands-audit/artifacts/include_lstm.zip https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_lstm.zip
curl.exe -f -L --max-time 30 --max-filesize 3000000 -o ml/openhands-audit/artifacts/include_metadata.zip https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_metadata.zip
curl.exe -f -L --max-time 45 --max-filesize 5000000 -o ml/openhands-audit/artifacts/source.zip https://codeload.github.com/AI4Bharat/OpenHands/zip/refs/tags/checkpoints_v1
python ml/openhands-audit/fetch_sample.py
python ml/openhands-audit/infer.py
python ml/openhands-audit/infer.py --export
```

Earlier probes: sandbox networking initially failed with WinError 10013. Approved
GitHub API release lookup then returned HTTP 403 rate-limit exceeded; direct
release download URLs worked. Initial sample lookup failed because the dataset
contains a nested ZIP and test labels retain spaces. The final range-reader
handles that layout and retrieved one sample successfully. Initial default
weights-only load rejected two Lightning callback types; the explicit inert
markers above allowed strict tensor loading without installing Lightning.

The optional export branch is prepared to use opset 17, fixed outer batch=1,
dynamic frame dimension, ONNX checker and CPU Runtime parity on this real sample
(`rtol=1e-4`, `atol=1e-4`). It has **not** exported a model; its dependency check
failed first. Installing `onnx` needs separate authorization before proceeding.

## Browser feasibility and next decision

ONNX Runtime Web can integrate with React/TypeScript; its documented WASM backend
supports the broad operator set, whereas GPU backends have subsets. The current
[WebGPU operator list](https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md)
does not list LSTM: begin any future parity test with WASM, not a WebGPU promise.
[Runtime Web documentation](https://onnxruntime.ai/docs/tutorials/web/).

Future browser artifacts would include an actually exported ONNX file, this exact
class mapping, preprocessing specification, license/attribution files, matching
MediaPipe browser model/assets and local WASM/runtime files. Test the same real
sequence against Python and browser outputs before camera integration. Keep all
landmarks on-device. Neither numerical parity nor fast execution repairs the
current recognition problem.

Recommendation: **do not integrate this BiLSTM**. Audit another real INCLUDE
architecture first, such as ST-GCN. A HEAD check returned HTTP 200 and 32,294,362
bytes for `include_stgcn.zip`; it was **not downloaded or tested**. This audit does
not establish whether ST-GCN, SL-GCN or BERT works. Obtain permission for that next
download and/or an isolated ONNX dependency installation. No new-model training
or camera UI work is authorized by this audit result.
