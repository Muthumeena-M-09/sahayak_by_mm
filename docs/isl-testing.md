# Try ISL Assist locally

Status, 3 November 2026: an **experimental local camera screen**, not a validated
ISL translator. The current browser extractor failed the one genuine clip sanity
check described below. Keep the feature off for citizen/production use.

## Open the camera test

The prepared model and runtime files are already available locally in `public/isl/`.
To regenerate them after running `python ml/validate_include.py`:

```powershell
npm run isl:prepare
```

Run a frontend-only test server with the feature enabled:

```powershell
$env:VITE_ENABLE_ISL_ASSIST='true'
npx vite --host 127.0.0.1 --port 5176
```

Open [the local camera test](http://127.0.0.1:5176/?isl-test). It needs no login and
never sends confirmed phrases to chat. Accept the local-processing notice, press
Start camera, wait for Ready, then press Sign a word / Retry. Sign one word with
your upper body and both hands visible. The preview is mirrored; inference is not.

Suggestions require three consecutive supported full-model predictions above 85%
model confidence. This threshold is provisional and uncalibrated. An unsure result
is normal for this research prototype. There is no guarantee of unknown-sign
rejection. Confirm word appends to the phrase; Edit suggestion lets you correct it.
Only Confirm and send phrase submits it, and the test page only displays it locally.

For integration testing, put `VITE_ENABLE_ISL_ASSIST=true` in your local `.env`,
restart `npm run dev`, sign in normally and open Ask → ISL Assist · Experimental.
That screen sends only explicitly confirmed text to the existing `/api/chat/stream`
endpoint with `input_mode: "isl"`; it sends no camera attachment, sign confidence
or landmarks. The backend uses its existing RAG logic and does not persist mode
analytics. Existing offline queue behavior remains unchanged.

Set the flag to false and restart/rebuild to disable the feature. No deployment
has been performed. HTTPS or localhost is required for camera APIs; a plain LAN
HTTP address usually cannot access the camera.

## Automated checks

```powershell
npm run lint
npm run test:isl
npx playwright install chromium
# With the frontend test server above running:
npm run test:isl:browser
npm run build
```

Tests cover preprocessing, missing-value handling, full-vocabulary classification,
smoothing/rejection, phrase building, permission denied/no camera/busy camera,
explicit confirmation, the real ONNX WASM adapter, real Worker model loading and
camera cleanup. Synthetic camera patterns and the confirmation fixture exist only
in tests, and never serve as evidence of ISL recognition accuracy.

## Genuine clip evaluation

```powershell
python ml/fetch_include_sample.py
node scripts/evaluate-isl-browser.mjs ml/.cache/real-clips/manifest.json
```

This downloads about 11 MB of a genuine INCLUDE recording into an ignored cache,
not the public app directory. The local browser test runner serves it directly to
the browser via a test-only route; no clip is uploaded to a remote service.

The measured sanity check used `Greetings/55. Thank you/MVI_0006.MOV`, CC BY 4.0,
Sridhar et al., INCLUDE, ACM MM 2020. SHA-256:
`48cd9741b508b757fc0993430003ac4d5adc232ffb15ac9ed2683e301181491b`.
It sampled 63 frames at 30 fps, with no missing tracked frames, and the model
predicted **it**, confidence **0.2265**, instead of **thankyou**. This is rejected
by the UI's supported-label/threshold logic. See `isl-browser-evaluation.json`.
The clip's training/test membership and signer identity are not established, so
this is neither held-out accuracy nor a general estimate of failure rate.

For broader evaluation, create a local JSON manifest array with `path`,
`expectedLabel`, `signer` and `split` for each licensed clip. The evaluator writes
predictions, missing-frame counts and per-sign correct/count totals to
`ml/output/browser-evaluation.json`. It uses the current landmark extractor and
30 fps sampling, which are not proven equivalent to the original training setup.
Use signer-disjoint held-out clips and background/unsupported examples. Record
precision, recall, confusion, rejection and latency separately; do not tune on
the final test set. The script does not independently verify split provenance.

## Manual checklist

- Test real supported signs with multiple ISL users; include regional variation,
  signing speed, different backgrounds, dark rooms and bright backlighting.
- Test no signing, unsupported signs, one missing hand, partial body and two people.
  Check false suggestions; high softmax confidence does not prove correctness.
- Deny/revoke permission, disconnect camera, occupy it in another application,
  stop while permission is pending, retry after failure and navigate away.
- Confirm the camera indicator clears on Stop, screen close and hidden tab.
- Test keyboard-only use, large text, mobile width and visible focus. No audio is
  needed. UI instructions currently use English; sign display text supports English
  and Hindi, with English fallback for other app languages.
- Inspect DevTools Network: inference assets use the same origin; no camera/video,
  image or landmark payloads leave the browser. Only final text enters chat.
- Test target Android/iOS browsers. Desktop Chromium automation does not establish
  mobile support, performance, accessibility or real-user accuracy.

Next model work: evaluate a properly held-out set, fix or quantify extractor and
timing differences, and train the licensed-data fallback if compatibility cannot
be established. Full sentence translation and text-to-ISL animation remain future
work. A model with unmeasured reliability must not be represented as validated.

## Recorded engineering verification

On 3 November 2026: six logic tests and eight Playwright browser tests passed;
TypeScript and production builds passed with the flag disabled and enabled. The
enabled production bundle also passed a real Worker startup/Stop smoke test in
headless Chromium. The mobile-width screenshot was visually inspected. These
results validate implementation behavior, not signing accuracy or mobile-device
performance. Existing unrelated working-tree edits were excluded from the commit.
