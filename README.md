# Sahayak

React/TypeScript citizen assistant with an Express backend. See `.env.example`
for application configuration. Install existing dependencies with `npm ci`, run
`npm run dev`, and verify with `npm run lint` and `npm run build`.

## Sahayak ISL Assist — experimental implementation

The Ask screen now includes a private camera preview, confirmation/editing and
phrase-to-chat flow. A real custom temporal classifier was trained on genuine
INCLUDE ISL poses: 32/35 correct on a small recording-disjoint test set. It passed
ONNX Runtime Web and Worker tests on the real held-out samples. This does not
establish signer-independent or live-camera accuracy. Doctor was only 1/3.

Live recognition remains disabled by `VITE_ENABLE_ISL_ASSIST=false` and the model
manifest's quality gate. The UI explains this and retains text/voice fallback.
No simulated predictions are used. No frames or landmarks leave the browser.

For explicit local testing, `npm run dev` on localhost now exposes **Enable
experimental recognition** with **Experimental — Not validated** and live
pipeline diagnostics. Production remains disabled and confidence/smoothing checks
remain active. No `.env` or manifest edits are needed. See
[webcam testing steps](docs/isl-development-testing.md).

Setup: `npm ci`, `npm run isl:assets`, `npm run dev`; then open
`http://localhost:3000` → Ask → Sahayak ISL Assist. Model/data binaries stay local
and are ignored by Git. A fresh checkout must prepare/train/publish them using
the documented commands. See [implementation/setup](docs/isl-implementation.md),
[evaluation](docs/isl-evaluation.md), and [machine-readable results](docs/isl-results/evaluation.json).

Trained vocabulary: Hello, Thank you, School, Hospital, Money, Medicine, Doctor,
Bank, Paper, Letter. The vocabulary is experimental, not a validated supported
sign list. Adding a sign requires audited recordings, retraining and evaluation;
editing `src/lib/isl/signs.json` alone cannot teach a new sign.

[ml/README.md](ml/README.md) documents the feature contract. Previous
[BiLSTM/ST-GCN audits](docs/openhands-stgcn-audit.md) remain historical evidence;
neither checkpoint is used by this new classifier. Unknown-sign rejection,
regional label review and multiple-user camera evaluation remain required.
Full sentence translation and text-to-ISL animation are future work.
