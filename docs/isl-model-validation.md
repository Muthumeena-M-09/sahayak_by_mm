# Sahayak ISL Assist — Phase 1 validation

Reviewed: 2 November 2026. Status: **INCLUDE checkpoint validation authorized;
camera integration remains gated on validation**.

## Recommendation

Genuine ISL research models exist. This review did not verify a production-ready,
licensed, browser-tested checkpoint for the requested 10–20 service signs. This is
not a claim that no suitable model exists. Prefer investigating AI4Bharat's INCLUDE
landmark checkpoints before training a new model. Do not substitute an alphabet
classifier, an ASL model, or MediaPipe gesture labels for ISL word recognition.

The plan now includes model acquisition, licensing review, conversion and evaluation
before camera recognition can be enabled. Per the supplied instructions, this is
the Phase 1 decision point; Phases 2–6 are not implemented yet.

## Existing application integration

- React 19 + TypeScript + Vite, Tailwind utility styling and existing theme tokens.
- `src/components/CitizenAskAndExplain.tsx` owns chat, voice transcription review,
  attachments and streaming responses. It posts message, conversationId,
  preferredLanguageCode and optional attachment to `/api/chat/stream`.
- `src/server/appRoutes.ts` mounts that authenticated endpoint and retrieves published
  knowledge chunks before producing the answer. Reuse it; no second RAG pipeline.
- `src/i18n/catalog.ts` contains UI translation keys; add ISL interface strings there.
- Future feature should live in `src/features/isl/`, behind a default-off Vite flag.
  Only explicitly submitted text and `input_mode: "isl"` should reach chat. Do not use
  the existing attachment upload path for camera data. No analytics are needed.
- Existing unrelated working-tree changes were present and have been left alone.

## Candidate evidence

“Not verified” means this review did not establish the fact, not that it is absent.
Research metrics below are author reports, not Sahayak measurements.

| Candidate | Vocabulary and ISL provenance | Input / format | License | Reported accuracy | Browser decision |
| --- | --- | --- | --- | --- | --- |
| [AI4Bharat INCLUDE](https://github.com/AI4Bharat/INCLUDE) | Isolated ISL words; full and INCLUDE50 variants. Exact service-sign overlap still needs label-map review. | Video converted to MediaPipe Hands + pose; PyTorch `.pth` LSTM/transformer checkpoints linked in [checkpoint index](https://github.com/AI4Bharat/INCLUDE/blob/master/pretrained_links.json). Some CNN entries are literal placeholders. | Repository MIT; dataset and downloaded weight terms must be verified separately. | No checkpoint-specific number verified in the inspected README. | Strongest lead. Reproduce preprocessing, obtain checkpoint, export ONNX and check output parity and mobile latency. Linked downloads were not fetched/tested. |
| [AI4Bharat OpenHands](https://github.com/AI4Bharat/OpenHands) | Word recognition across several languages, including Indian. Must select an ISL-specific checkpoint and label order. | Pose sequences; Python/PyTorch research tooling, not a verified Web artifact. | Apache-2.0 code; repository explicitly directs users to dataset-specific terms. Weight rights not independently verified. | [Paper](https://arxiv.org/abs/2110.05877) describes released models; no exact chosen-checkpoint metric established here. | Candidate for conversion, not drop-in browser code. Project reports it is no longer actively maintained. |
| [Hemg/Indian-sign-language-classification](https://huggingface.co/Hemg/Indian-sign-language-classification) | [Config](https://huggingface.co/Hemg/Indian-sign-language-classification/raw/main/config.json) has A–Z and 1–9, no service words. Model card says training dataset is unknown; genuine ISL provenance not established. | RGB 224px images; ViT, PyTorch/Safetensors. | Card declares Apache-2.0; training-data rights unverified. | Card reports 0.9905 evaluation accuracy, with unspecified data provenance; not live ISL performance. | Reject for word scope. ONNX export is conceivable but cannot fix vocabulary/provenance. |
| [BRO-CODES-HERE/INDIAN-SIGN-LANGUAGE](https://github.com/BRO-CODES-HERE/INDIAN-SIGN-LANGUAGE) | Claims ISL alphabet/digits, not service words. Independent linguistic validation absent. | Cropped images; Keras `.h5`, Python/Flask. | README claims MIT; underlying data rights not verified. | No reproducible held-out result verified; example training output is not evidence. | Reject for scope. Server inference design also fails local-only camera requirement. Conversion would require TF.js or a validated ONNX path. |
| [Exploration-Lab CISLR](https://huggingface.co/datasets/Exploration-Lab/CISLR) | ISL word dataset from the authors; exact usable subset not inspected. | Video and annotations; dataset, not an inference artifact. | HF card declares AFL-3.0; confirm applicability to source videos before use. | Not applicable: dataset, not a selected model. | Alternative training source, subject to provenance, vocabulary and rights review. |
| [Kaggle ISL](https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl) | Linked by the alphabet project. Direct page yielded no readable metadata. | Format and contents not independently verified. | Not verified. | Not applicable / not verified. | Do not select based on a project’s description alone. |
| [ISL Hand Gesture Dataset](https://data.mendeley.com/datasets/n34wm8sb3x/1) | Author describes 26 signs, 550 RGB images each. Actual labels and linguistic review not inspected. | Image archive; no pretrained model established. | Dataset page declares CC BY 4.0. | Not applicable. | Not selected: temporal/service vocabulary fit not established. |

The [official INCLUDE page](https://github.com/AI4Bharat/sign-language.ai4bharat.org/blob/master/docs/INCLUDE.md)
links [Zenodo record 4010759](https://zenodo.org/records/4010759) and baseline code.
The Zenodo record could not be read with the research tool; do not infer its license
from the code license or third-party dataset catalogs. No dataset or weight was
downloaded and no model was executed during this review.

## Fallback proposal

If checkpoint rights, conversion or device performance cannot be established,
train a small temporal landmark classifier on a licensed, genuine ISL dataset.
`ml/train_isl.py` provides an offline training/export scaffold for already extracted
landmark sequences. It does not collect data, download weights or fabricate examples.

Before training, select 10–20 actual dataset labels with ISL-user review, including
non-sign/background examples in evaluation. The requested help/documents/ration
examples are suggestions, not validated supported signs. No supported vocabulary
is currently published. Keep original signer identities for disjoint train,
validation and test partitions; never split frames from a clip across partitions.
Use validation data for thresholds; reserve test data for final evaluation.

Landmarks must encode both hands and body context with stable left/right ordering,
missing-landmark masks, consistent normalization, temporal sampling and mirroring
policy. Pin the extractor version and retain this contract with the model. A hand
only static classifier can lose movement and body/face distinctions. The scaffold
accepts prepared features; a dataset-specific extractor remains necessary.

Export to ONNX, compare Python and ONNX probabilities on identical held-out inputs,
then test ONNX Runtime Web in a Worker on target phones. No browser compatibility,
latency or accuracy is claimed. No production model placement is defined yet.

## Gates for proceeding

1. Approve checkpoint-validation work first, or approve the training fallback.
2. Verify dataset/weight rights and exact label list; record artifact hashes.
3. Reproduce the source preprocessing and held-out metrics, including per-sign
   recall, precision, confusion matrix, false activations and unknown-sign rejection.
4. Obtain review from multiple ISL users and measure lighting, background, signing
   speed and signer variation. Research accuracy does not establish usability.
5. Implement consent, local-only camera processing, Worker inference, smoothing,
   explicit Confirm/Retry/Edit, phrase building and existing chat integration.
6. Test permissions, no camera, busy camera, low light, cleanup after navigation,
   keyboard access, reduced motion, mobile layout and no camera network payloads.

Future scope: continuous sentence translation and text-to-ISL animation.

## Authorized follow-up: INCLUDE checkpoint inspection

The user approved investigating and converting INCLUDE checkpoints after the
initial review. The following findings supersede the acquisition uncertainties
above; the candidate table preserves the initial review evidence.

- Pinned upstream source commit: `df348f4a640060d4d39f02556d9f96851e8c46c7`.
- The [Zenodo API](https://zenodo.org/api/records/4010759) was accessible via a
  direct HTTP request. Its dataset metadata declares **CC BY 4.0**. It describes
  isolated ISL recordings by Deaf students, 263 words and 4,292 videos. Preserve
  attribution and verify any separately distributed checkpoint terms. Code is MIT;
  no separate weight license was found in the inspected checkpoint index.
- Paper-level accuracy in the metadata is 94.5% for INCLUDE50 and 85.6% for
  INCLUDE. Neither is a measurement of this converted small model.
- Downloaded `include_no_cnn_transformer_small.pth`: 46,230,805 bytes;
  SHA-256 `c25f7e8a4eb6f11964d4038552ab8e60f23dde392be7ab722f46aef4d7948c7e`.
  It loads with PyTorch restricted weights-only deserialization after explicitly
  allowing NumPy scalar metadata. Unrestricted pickle loading is not used.
- Checkpoint tensors match 134 input features, hidden size 256, two BERT layers,
  256 positional embeddings and 263 outputs. Saved `score` is
  `0.8134057971014492`. Source training code saves validation accuracy in this
  field; the split, score and inference behavior have not been reproduced here.

### Verified vocabulary coverage

The [full label map](https://github.com/AI4Bharat/INCLUDE/blob/df348f4a640060d4d39f02556d9f96851e8c46c7/label_maps/label_map_include.json)
contains these potential service-prototype labels (index in parentheses): bank
(13), card (34), doctor (58), hello (101), hospital (104), job (113), letter (120),
medicine (135), money (138), office (149), paper (155), police (168), school (185),
thankyou (224), trainticket (236). These are candidate vocabulary entries, not
validated recognition claims or confirmed sign-to-intent mappings. ISL-user review
is still needed. No exact help, yes, no, documents or ration labels occur in this
map. Do not rename paper/card/letter to documents without review.

### Preprocessing and conversion constraints

The pinned extraction and dataset source establish:

- Two separate legacy MediaPipe Hands/Pose trackers; Pose uses the obsolete
  `upper_body_only=True` option and a 25-point pose layout. Both hand layouts have
  21 points. Only x/y coordinates are used, without visibility masks or z values.
- Input order is pose, hand1, hand2, with interleaved x/y coordinates. Wrist
  proximity is used to assign a single detected hand; the two-hand case does not
  explicitly reorder detections. That ambiguity needs real clip testing.
- Missing values are interpolated over time in both directions. Entirely absent
  coordinate arrays become zero, but individual all-missing landmark columns can
  remain NaN. A robust replacement must handle those explicitly and be evaluated.
- Normalized x/y values are multiplied by 1920/1080. Sequences are zero-padded to
  169 frames, without an attention mask; longer clips are not handled by the
  reference dataset loader. Preserve unmirrored model inputs and mirror only the
  eventual visual preview unless evaluated otherwise.
- A current 33-point pose output must not be silently substituted for the legacy
  25-point layout. Establish a tested mapping/extractor or retrain with a current
  landmark contract. This remains a blocker for claiming browser recognition.
- Upstream final `F.dropout` is active even in eval mode. The export script
  explicitly disables it in eval and adapts the deprecated BERT import. It
  otherwise keeps the source network and strictly loads every checkpoint tensor.
  Changing dropout requires re-evaluation; parity is against the adapted model.

`ml/fetch_include.py` reproduces acquisition; `ml/validate_include.py` performs
local conversion and numerical parity checks and writes a machine-readable report.
Downloaded artifacts and generated output are ignored by Git. No camera data,
training examples or user information are transmitted by these tools.

### Measured conversion result

Export and ONNX schema validation passed. Four deterministic engineering probes
(zeros and generated coordinate arrays with different padding lengths) matched the
adapted PyTorch model within `atol=1e-4, rtol=1e-4`; worst absolute logit difference
was `5.7220458984375e-06`, with all top-1 predictions matching. These generated
arrays are conversion tests only and are never used as recognition results.

Export size: 15,414,369 bytes. SHA-256:
`4abd701d12076d0f68d50039a6660352a42808dd7dda84932a8b29c23e4c0c2a`.
The [recorded report](isl-include-conversion.json) includes runtime versions,
labels and probe errors. The actual model remains local at
`ml/output/include/model.onnx` rather than being bundled into the app.

Remaining gates: browser WASM/WebGPU compatibility and
mobile latency, legacy extractor compatibility, checkpoint reuse terms, held-out
ISL accuracy, non-sign rejection and multiple-user evaluation. Do not enable
recognition until these are resolved. Training on a current landmark contract
remains the fallback, rather than an unverified claim of compatibility.
