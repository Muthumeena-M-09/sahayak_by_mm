# Sahayak

Multilingual service assistant using React, TypeScript, Express and Gemini with RAG.

## ISL Assist — model validation stage

See [model findings and recommendation](docs/isl-model-validation.md) and the
[offline fallback training instructions](ml/README.md).

ISL Assist is not enabled or implemented in the app yet. No verified browser model
is bundled, so there is no model placement path or feature flag to configure at
this stage. Existing Text and Voice flows remain available.

To add signs later, first verify that the licensed dataset and model actually
support them, preserve the model's label order, and obtain ISL-user validation.
The eventual sign configuration will map validated labels to translated text;
editing a configuration alone cannot teach a model new signs.

Known limitations: checkpoint availability and licensing, exact service vocabulary,
conversion parity, device performance and real-user accuracy remain unverified.
Full sentence translation and text-to-ISL animation are future work. Camera frames
must remain on-device; only explicitly confirmed text may enter the chat pipeline.
