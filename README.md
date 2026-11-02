# Sahayak

Multilingual service assistant using React, TypeScript, Express and Gemini with RAG.

## ISL Assist — experimental local test

An experimental camera test is now implemented. Start with
[local setup and testing](docs/isl-testing.md). Keep it disabled for production:
the first genuine-clip browser sanity check did not recognize the expected sign.

See [model findings and recommendation](docs/isl-model-validation.md) and the
[offline fallback training instructions](ml/README.md).

ISL Assist is disabled by default. An INCLUDE research
checkpoint has been converted to ONNX and passed numerical parity checks; see
the [conversion report](docs/isl-include-conversion.json). The model is generated
locally at `ml/output/include/model.onnx`; `isl:prepare` copies runtime assets to
the ignored `public/isl/` directory for same-origin inference. Browser
recognition accuracy remains unverified. `VITE_ENABLE_ISL_ASSIST=true` enables
the experimental Ask input and `/?isl-test` local test page. Existing Text and
Voice flows remain available.

To add signs later, first verify that the licensed dataset and model actually
support them, preserve the model's label order, and obtain ISL-user validation.
`src/features/isl/signs.json` maps candidate labels to English/Hindi display text;
editing a configuration alone cannot teach a model new signs.

Known limitations: checkpoint reuse terms, legacy landmark extraction compatibility,
device performance and real-user accuracy remain unverified. The full label map
contains service-relevant words; a reviewed 10–20-sign subset is still pending.
Full sentence translation and text-to-ISL animation are future work. Camera frames
must remain on-device; only explicitly confirmed text may enter the chat pipeline.
