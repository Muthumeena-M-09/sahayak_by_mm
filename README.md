# Sahayak

Multilingual service assistant using React, TypeScript, Express and Gemini with RAG.

## ISL Assist — model validation stage

See [model findings and recommendation](docs/isl-model-validation.md) and the
[offline fallback training instructions](ml/README.md).

ISL Assist is not enabled or implemented in the app yet. An INCLUDE research
checkpoint has been converted to ONNX and passed numerical parity checks; see
the [conversion report](docs/isl-include-conversion.json). The model is generated
locally at `ml/output/include/model.onnx`, outside the public app assets. Browser
recognition and real-sign accuracy remain unverified, so there is no app feature
flag to configure yet. Existing Text and Voice flows remain available.

To add signs later, first verify that the licensed dataset and model actually
support them, preserve the model's label order, and obtain ISL-user validation.
The eventual sign configuration will map validated labels to translated text;
editing a configuration alone cannot teach a model new signs.

Known limitations: checkpoint reuse terms, legacy landmark extraction compatibility,
device performance and real-user accuracy remain unverified. The full label map
contains service-relevant words; a reviewed 10–20-sign subset is still pending.
Full sentence translation and text-to-ISL animation are future work. Camera frames
must remain on-device; only explicitly confirmed text may enter the chat pipeline.
