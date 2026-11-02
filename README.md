# Sahayak

React/TypeScript citizen assistant with an Express backend. See `.env.example`
for application configuration. Install existing dependencies with `npm ci`, run
`npm run dev`, and verify with `npm run lint` and `npm run build`.

## Sahayak ISL Assist — model validation stage

Phase 1 findings and the proposed integration are in
[docs/isl-model-validation.md](docs/isl-model-validation.md). Genuine ISL research
models exist, but no model is yet validated for this application's browser runtime.
The [OpenHands audit](docs/openhands-include-audit.md) includes reproducible local
Windows inference: the released BiLSTM executed but misclassified a genuine Hello
sample as Season. It is not approved for integration; ONNX export remains blocked
by a missing dependency. Re-run locally with `python ml/openhands-audit/infer.py`.
Camera/recognition UI and the proposed default-off `VITE_ENABLE_ISL_ASSIST` feature
flag are pending the requested model decision; setting that variable now has no
effect. Existing Text/Voice behavior is unchanged.

[ml/README.md](ml/README.md) documents local fallback training, evaluation, model
placement and adding signs. No pretrained weights, supported-sign list or accuracy
claims are bundled for production. Audit-only downloaded files remain local and
are ignored by Git. Browser export, audited service vocabulary and evaluation with
multiple ISL users remain required. Camera frames and landmarks must stay local;
only explicitly confirmed text may enter the existing chat endpoint. Full sentence
translation and text-to-ISL animation are future work.
