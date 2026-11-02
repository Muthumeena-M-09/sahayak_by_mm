# Local experimental ISL recognition

Implemented 2026-11-03. This does not retrain or validate the model and does not
change Gemini/RAG, model weights, `.env`, or the model's production quality flag.

## Why the camera previously produced no words

The camera preview is independent of recognition. The original hook returned
before starting MediaPipe or the worker unless both `VITE_ENABLE_ISL_ASSIST` and
the manifest's `recognitionEnabled` were true. The local environment had no ISL
enable flag, and `public/models/isl/manifest.json` explicitly disables recognition.
That was an intentional quality gate, not evidence of a failed ONNX model.

There were two additional reasons Review word could remain empty: any momentary
missing-hand callback erased the temporal buffer, and rejected low-confidence or
inconsistent predictions were invisible. A real landmark-sequence regression test
reproduced the buffer never reaching 32. Brief invalid callbacks are now skipped
without adding or repeating frames; a gap over 1.5 seconds without valid detection
resets the window. Missing shoulders/invalid/nonfinite input is still rejected.
The confidence threshold remains .85 and two consistent windows are still required.

## Activate on your laptop

```powershell
cd D:\hackathon\sahayak_by_mm
npm run isl:assets
npm run dev
```

1. Open **http://localhost:3000** or **http://127.0.0.1:3000**. Use the development
   server, not `npm run preview` or a production build. If another development
   server is already running, refresh that localhost page after the code update.
2. Sign in normally, open **Ask → Sahayak ISL Assist**.
3. Read **Experimental — Not validated**, then click **Enable experimental recognition**.
   Activation is explicit, kept only in React memory, and resets when the panel
   is closed or the page reloads. You do not need to edit `.env` or the manifest.
4. Click **Start camera** and grant permission (or enable recognition while the
   preview is already running). Wait for both **ONNX worker: ready** and
   **MediaPipe: ready** in Local recognition diagnostics.
5. Face the camera in good light. Keep both shoulders and at least one signing
   hand fully in view. Perform a genuine supported ISL sign you know, such as
   **Hello**, using the relevant signing variant; a generic wave is not proof of
   ISL recognition. Keep the whole movement visible. Allow several seconds for
   **32 valid frames**, depending on your laptop's landmark-processing speed.
6. Check the actual raw model class/confidence and **Last prediction decision**.
   Review word is populated only after a label scores at least **85% for two
   consecutive prediction windows**. The raw diagnostic output does not bypass
   this filter or automatically confirm a word.
7. Review/Edit, Confirm into a phrase, and choose **Use phrase in chat draft**.
   The existing Send button remains a separate action. Use **Retry** to collect
   a fresh window or permit another occurrence of the same sign.
8. Click **Disable experimental recognition** to stop inference while keeping
   preview available, or **Stop camera / Return to text** to release the camera.

If the activation control is absent, you are on a production/preview build or a
non-loopback hostname (for example a LAN address). It is intentionally unavailable
there, regardless of environment flag or model-manifest edits.

## What the diagnostic panel means

| Field | Meaning / action |
| --- | --- |
| Existing feature flag / quality gate | Original flags remain unchanged; local activation bypasses only the pending quality gate, not model integrity or prediction safeguards |
| Body / shoulders / hands | Live detections after visibility filtering; reposition if missing |
| Landmark callbacks | Should increase while local extraction runs |
| Temporal buffer | Valid frames collected, capped at 32; invalid frames are never fabricated |
| ONNX input | Last submitted `[1,32,225]` tensor and finite-value check |
| Requests / results | Worker inference requests and actual model results received |
| Raw model prediction / confidence | Unfiltered output from the real existing ISL-trained ONNX model |
| Current stage / rejection | Missing landmarks, collecting frames, awaiting worker or runtime error |
| Last prediction decision | Below threshold, inconsistent windows, duplicate suppression or acceptance |

If frames reset repeatedly, improve shoulder/hand visibility and lighting. If
raw predictions appear but Review word stays empty, inspect the confidence and
consistency decision. Do not lower safeguards to force an incorrect word. This
model has known class weaknesses and has not been validated with live ISL users.

## Safety and implementation

The production recognition path is blocked in `useISLRecognition` regardless of
the legacy feature flag or manifest state. The development control and diagnostic
panel render only when `import.meta.env.DEV` is true and hostname is exactly
localhost, 127.0.0.1 or loopback IPv6. The hook independently checks that boundary.

No new model or generic gesture recognizer is used. Model SHA-256, vocabulary,
tensor dimensions and finite-output checks remain in the existing adapter. All
MediaPipe input, landmark buffers and ONNX inference stay on-device. Diagnostics
show statuses, counts and word scores, never camera images or coordinates.
Nothing is persisted to browser storage or sent to the chat without the existing
explicit review/draft/send sequence. No backend code was changed.

Relevant checks: TypeScript, production build, ISL unit tests for the local-only
gate and temporal/filter behavior, actual browser camera/runtime tests, existing
chat confirmation tests, real held-out ONNX parity and a genuine-landmark
32-frame-to-Worker test. Physical-webcam recognition quality still requires your
manual check; synthetic camera tests are runtime checks, not ISL accuracy results.

Executed successfully for this change: `npm run lint`, `npm run build`, all
**42 project unit tests**, and **11 Chrome browser tests**. The model weights and
Gemini/RAG backend were not modified. The browser suite also rechecked all 35
held-out ONNX/reference outputs; the additional pipeline test uses genuine
landmark data to exercise buffering and the real worker, not hardcoded results.
