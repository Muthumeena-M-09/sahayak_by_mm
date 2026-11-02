# Sahayak ISL Assist implementation

Implemented 2026-11-03. **Partially working; live recognition disabled.** This
session trained a real classifier using genuine licensed INCLUDE pose recordings,
exported it, and tested its real outputs in Chrome and a Web Worker. Neither
previous OpenHands recognition checkpoint is used by the new classifier.

Local testing update: an explicit localhost-development control can now run the
existing model experimentally without enabling production recognition. It keeps
threshold/smoothing safeguards and shows live landmark/buffer/model diagnostics.
See [development webcam testing](isl-development-testing.md); the quality-gated
default and outstanding validation limitations below remain unchanged.

## Current behavior

Open the existing citizen Ask screen and select **Sahayak ISL Assist**. Camera
permission is requested only by Start camera. The preview is mirrored; inference
coordinates are not. A visible status, permission/no-camera/busy errors and a
low-light heuristic accompany the preview. Stop, close, switching modes, hiding
the tab, or unmounting stops camera tracks. Pending permission requests are
cancelled logically and any stream obtained after cleanup is stopped.

The trained model has not passed full recognition validation: Doctor is 1/3 on
the small held-out set, unknown/no-sign data is absent, signer identities and
independent ISL-user label review are unavailable, and real signing through the
camera has not been evaluated. Both the environment flag and model manifest gate
must permit recognition. The normal UI explains the disabled state and never
generates simulated predictions. Camera preview and editable text fallback still
work. The test harness deliberately exercises the real adapter separately from
that production gate; it does not approve live recognition.

Review a recognized or typed word, Confirm it into a phrase, optionally Edit or
Clear, then choose **Use phrase in chat draft**. This inserts text into the
existing composer without sending. The existing Send button sends reviewed text
through `/api/chat/stream`, preserving selected language and conversation. ISL
requests contain only `message`, `preferredLanguageCode`, optional
`conversationId`, and `input_mode: "isl"`. Backend validation rejects extra ISL
fields, including attachments or landmarks. Text/voice/document requests retain
their prior format. No Gemini/RAG implementation was duplicated. No automatic
audio playback was introduced; entering ISL stops existing playback.

## Local setup and run

```powershell
cd D:\hackathon\sahayak_by_mm
npm ci
npm run isl:assets
npm run dev
```

Open `http://localhost:3000`, sign in through the existing app and open Ask.
Existing `.env` credentials were not modified. `VITE_ENABLE_ISL_ASSIST=false` is
documented in `.env.example`. Merely setting it true does not bypass the
manifest's `recognitionEnabled: false`; do not change the manifest until remaining
quality and live-user validation gates pass. Keep the current model experimental.

Current locally generated assets:

- `public/models/isl/model.onnx`: trained classifier (ignored by Git).
- `public/models/isl/manifest.json`: vocabulary, model digest, quality status.
- `public/models/isl/labels.json`, `preprocessing.json`, `ATTRIBUTION.txt`.
- `public/ort/`: matching Runtime Web WASM/module files, generated from npm.
- `public/mediapipe/holistic/`: local landmark assets, generated from npm.
- `ml/runs/prototype-v1/best.pt`, training log, manifest and evaluation results.

Runtime assets, poses, NPZ files and weights stay local. They are not committed.
A fresh checkout must regenerate/retrain assets before using the adapter; it
fails clearly if they are absent. Run `npm run isl:assets` after npm installation
and before building; `npm run build` then includes the local runtime assets.
Large runtime assets are not included in the service worker's model cache; first
use needs the local host/server to supply them. No CDN dependency is used for
camera processing or inference. Existing app Google Font requests are unrelated.

## Reproduce preparation, training and evaluation

The prior audited metadata ZIP and bounded range-reader are reused. No full
dataset archive is needed; `prepare_isl.py` retrieves only selected members,
reuses cached audit samples, checks CRC/size, rejects corrupt/duplicate landmark
content, normalizes and splits the subset. The source is CC BY 4.0; attribution
is retained. There are no fabricated negative examples or invented signer IDs.

This workstation already has the isolated Python environment below. For another
machine install `ml/requirements.txt` into a local environment with Python 3.11.

```powershell
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe ml/prepare_isl.py
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe ml/train_isl.py --train ml/data/isl/train.npz --validation ml/data/isl/validation.npz --manifest ml/data/isl/dataset-manifest.json --out ml/runs/prototype-v1 --epochs 250 --patience 35 --allow-unknown-signers
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe ml/evaluate_isl.py --model ml/runs/prototype-v1/model.onnx --manifest ml/runs/prototype-v1/manifest.json --test ml/data/isl/test.npz --allow-unknown-signers --out ml/runs/prototype-v1/evaluation.json
ml/openhands-audit/artifacts/onnx-env/Scripts/python.exe ml/publish_isl.py
```

Training refuses an existing output directory; use a new run name for a repeat
and pass that run to evaluation/publishing. `--allow-unknown-signers` explicitly
permits recording-disjoint evaluation without claiming signer independence. It
does not fabricate identities. The publisher leaves recognition disabled.

For new consented local video, `ml/extract_isl_landmarks.py VIDEO --out FILE.npz`
provides a legacy MediaPipe extraction path. Its optional Python dependencies
(`mediapipe==0.10.14`, OpenCV) are not installed/tested in this session; use an
isolated environment if needed. Browser Holistic extraction is tested separately.
The cached training poses originated from an older upstream MediaPipe pipeline;
cross-version/camera feature drift still requires live evaluation.

## Architecture and extension

`ISLAssist` owns consent, camera controls, reviewed word and phrase. `ISLCamera`
owns the camera lifecycle. `useISLRecognition` samples locally with MediaPipe
Holistic (npm 0.5.1675471629), retains pose33/left21/right21 and discards face
results. Visibility checks zero missing body joints. Its bounded 32-frame buffer
feeds the shared preprocessing contract. ONNX inference runs in `isl.worker.ts`
using ONNX Runtime Web 1.24.2 WASM, one thread, with a single in-flight request.
No frame backlog or per-frame server call is created.

The normal adapter validates ISL language, known labels, preprocessing ID and
model SHA-256 before loading local bytes. It checks finite `[1,32,225]` input and
class-count-matched finite logits. Confidence filtering uses a provisional .85
threshold and two consistent windows; emitted duplicates are blocked until a
deliberate reset/Retry. Low-quality/missing landmarks clear the buffer. These
heuristics are not measured unknown-sign rejection.

`src/lib/isl/signs.json` maps the actual source labels into English, Tamil, Hindi,
Telugu and Kannada display words. The model manifest determines which entries
may appear; the map cannot teach the classifier new signs. Critical consent and
controls are localized in feature strings; some technical/error/reference text
still falls back to English. Existing theme variables, text scaling and native
keyboard controls are reused; touch buttons are at least 44 px and no new motion
animation is required.

To add a sign: review licensed source clips with an ISL user, add unique data and
split records, retrain, re-evaluate every class, export and run browser parity,
then update display mappings and manifests. Add genuine consented no-sign and
unsupported-input evaluation before enabling. Full sentence translation and
text-to-ISL animation remain outside this prototype.

## Verification commands

```powershell
npm run lint
npm run build
npm run test:isl
npm run test:isl:browser
# All project unit tests, PowerShell:
$islTestFiles = @(rg --files src -g '*.test.ts')
node --import tsx --test @islTestFiles
```

Browser tests use the installed Chrome at the path in `playwright.config.ts`;
override `ISL_BROWSER_PATH` if necessary. The test harness is separate from the
shipped app entry point. Camera hardware and API responses are fixtures in UI
tests. Model/parity tests use the actual trained model and genuine held-out
arrays, never a fabricated classifier. Full browser parity requires ignored
local `ml/data/isl/browser-fixtures.json`, generated by publishing.

Manual completion checklist: real ISL users signing through physical cameras;
regional label review; bright/dark/background/speed/mobile variability; unknown
and no-sign false acceptance; screen reader/high contrast/text scaling; permission
dismissal during navigation; authenticated live Gemini/RAG responses and live
microphone/Sarvam. Automated tests do not establish these user-facing outcomes.

## Executed test status

| Component | Status | Evidence / remaining limit |
| --- | --- | --- |
| Genuine ISL dataset and training | WORKING | 174 source clips, reproducible training, real weights |
| Held-out evaluation and ONNX export | WORKING | 32/35; full per-class/confusion results; limited population |
| Browser and Worker inference | WORKING | 35 genuine sequences match reference; local WASM |
| Camera lifecycle and extraction runtime | PARTIALLY WORKING | Synthetic-device start/stop/errors and real MediaPipe callbacks pass; physical-camera ISL recognition untested |
| Confirmation/edit/clear/phrase/chat draft | WORKING | Component and actual CitizenAskScreen tests pass |
| Existing text/voice regressions | PARTIALLY WORKING | Unit tests and browser text path pass; live microphone/Sarvam not tested |
| Gemini/RAG wiring | WORKING | Existing endpoint reused; browser SSE rendering test passes |
| Live Gemini answer | BLOCKED | Authenticated live request emitted meta, then service-unavailable error |
| Default live ISL recognition | BLOCKED | Per-sign quality, unknown rejection, linguistic/user-camera validation incomplete |
| Privacy | WORKING in executed tests | No external model/camera requests; backend rejects ISL biometrics; real-device audit still advised |

Executed: `npm run lint`, `npm run build`, **40/40 project unit tests** and
**9/9 Chrome browser tests**. The latter include real model/Worker parity, camera
permission/missing/busy states and cleanup, mobile width, missing manifest,
confirmation/editing, the actual existing citizen composer and SSE rendering,
and local MediaPipe startup/results with synthetic camera frames.

An additional **live** guest-authenticated request reached the existing chat
pipeline and returned SSE `meta` then `error`: "Answer generation is temporarily
unavailable. Please retry." No final answer was received. Health returned 200.
[Live check record](isl-results/live-chat.json). Credentials were not printed or
modified; this is a current provider/service blocker, not a simulated success.

Changed files: feature components under `src/components/isl`, recognition hook,
`src/lib/isl`, worker, the existing citizen screen and chat route; Python
preparation/preprocessing/extraction/training/evaluation/publishing utilities;
local asset-preparation script; package manifests, `.env.example`, `.gitignore`,
Playwright config and `tests/isl`; public model metadata/attribution; README and
the implementation/evaluation/result documents. No dataset, video, pose array,
secret or model binary is committed. `PROJECT_REVIEW.md` remains untouched.
The [exact changed-file list](isl-results/changed-files.txt) is included for review.
