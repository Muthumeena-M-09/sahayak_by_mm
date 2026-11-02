# Sahayak ISL Assist: Phase 1 validation

Reviewed 2026-11-02. Decision: **hold Phase 2 pending model-path approval**.

Genuine ISL resources exist. No candidate below has yet passed checkpoint retrieval,
label-map verification, browser conversion/parity, mobile latency, and licensing
review together. This is not a claim that no suitable pretrained model exists.
No model was downloaded or executed; no application accuracy has been measured.

## Existing integration points

- React 19 + TypeScript + Vite; citizen chat is `src/components/CitizenAskAndExplain.tsx`.
  Voice recording uses `useVoiceAudio` in `src/hooks/usePWAAndNetwork.ts`; transcripts
  enter an editable draft before submission.
- Authenticated SSE POST `/api/chat/stream` in `src/server/appRoutes.ts` accepts
  `message`, conversation ID, preferred language and optional document attachment.
  Reuse its normalization, retrieval and response generation in `src/lib/gemini.ts`,
  `src/lib/embeddings.ts` and grounding helpers. Never attach camera data.
- `src/context/AppContext.tsx` provides language, translation and API helpers;
  `src/i18n/catalog.ts` supplies UI strings. Tailwind and CSS variables in
  `src/index.css` provide the existing theme, text scaling and accessibility styling.
- Express entry is `server.ts`; database access uses Drizzle/PostgreSQL, with
  Supabase-compatible configuration in `src/db/index.ts`. No analytics change needed.
- Existing tests use Node test/assert via TypeScript. No component test runner is
  declared. No existing README was found. The pre-existing untracked
  `PROJECT_REVIEW.md` is outside this change.

## Candidates and evidence

| Candidate | Vocabulary / genuine ISL evidence | Input / format | License | Reported metric | Browser decision |
| --- | --- | --- | --- | --- | --- |
| [AI4Bharat INCLUDE](https://huggingface.co/datasets/ai4bharat/INCLUDE) | 263 isolated word labels; INCLUDE-50 subset. Creator documents Indian signing filmed in Chennai, with regional limitations. | Video; HF holds metadata, actual videos are separately hosted on Zenodo. Dataset, not executable weights. | HF card: CC BY 4.0; retain attribution and verify archive terms. | Not applicable to a dataset. | Suitable training candidate; requires extraction, training and ONNX export. |
| [AI4Bharat OpenHands](https://github.com/AI4Bharat/OpenHands), [paper](https://arxiv.org/abs/2110.05877), [inference instructions](https://openhands.ai4bharat.org/en/latest/instructions/inference.html) | Multilingual library with INCLUDE-specific models; use only the ISL checkpoint and its exact vocabulary, never another language's weights. | Temporal poses, MediaPipe extraction tooling; PyTorch checkpoints/config/metadata. | Library Apache 2.0; checkpoint and underlying dataset terms still need confirmation. | Paper reports benchmarks; exact checkpoint-specific score/split not verified here, so no number adopted. | **First pretrained candidate to investigate.** Needs exact joint order, normalization/window contract, accessible weights, ONNX export, operator support, numerical parity and mobile profiling. Upstream says no longer actively maintained. |
| [Sanket weights on Hugging Face](https://huggingface.co/ayush2635/sanket-isl-translator) | Author claims INCLUDE training, 250 categories; exact class mapping/provenance not checked. | Video plus 195 pose features/frame; TimeSformer/pose encoder/T5; `.pth`. | Model card MIT; underlying data/backbone obligations need review. | Author reports validation BLEU-1 50.6%; **not classification accuracy**. | Heavy multi-part export and decoder loop; no verified web artifact. Not selected for this small classifier prototype. |
| [signBridge](https://github.com/Uni-Creator/signBridge) | Author reports 76 ISL word classes, Kinetics backbone fine-tuned for ISL; dataset and label provenance need audit. | 16-frame RGB clips, pose/hand pipeline; PyTorch Swin3D-S, about 126 MB. | Repository MIT; weights/data terms not independently verified. | Author reports top-1 66.84%, macro F1 .638 on 187 samples; not reproduced. | Published architecture streams frames to server: incompatible as supplied. Local ONNX conversion and mobile testing would be required; do not reuse frame-upload flow. |
| [Kaggle Indian Sign Language (ISL), Prathum Arikeri](https://www.kaggle.com/datasets/prathumarikeri/indian-sign-language-isl) | Alphabet/image candidate; full vocabulary and independent ISL validation unverified. | Image dataset; not a verified pretrained artifact. | Primary page returned no readable metadata; **unverified**, do not infer from third-party summaries. | No verified primary-source model accuracy. | Not approved; alphabet recognition would not meet word-level service scope. |

Sources were inspected as public primary pages; candidate author claims are not
independent validation. Kaggle content and some model-documentation URLs were
unreadable. No generic gesture/ASL/BSL substitute is acceptable.

## Recommendation and fallback

First audit the OpenHands INCLUDE checkpoint bundle. If its artifacts or conversion
fail validation, use a small temporal classifier over on-device MediaPipe Holistic
landmarks, trained on a licensed, manually audited INCLUDE subset. Training utility:
`ml/train_isl.py`; held-out evaluation: `ml/evaluate_isl.py`.

Do not promise the example signs from the request. Select 10–20 service-relevant
labels only after checking source clips and an ISL user's interpretation. The HF
preview includes School and Thank you, but also visibly repeats a video path under
different labels (University/Bank and Page/Bird): audit original files and exclude
conflicts before training. There is **no approved supported-sign list yet**.

The scripts consume locally extracted, normalized temporal landmarks, not raw
videos. They do not download data, extract landmarks, or train automatically.
`ml/README.md` defines the contract and license/split requirements. Extraction and
browser preprocessing must later implement the same contract. Retain both hands
and upper-body context; static alphabet classifiers cannot cover dynamic words.

## Release gates and proposed Phase 2–6 contract

1. Approve the pretrained audit or fallback path; verify exact artifacts, hashes,
   licensing, vocabulary and preprocessing. Record model-specific metrics here.
2. Validate exported ONNX against training outputs and profile a representative
   mobile browser. Ship assets locally, with a default-off `VITE_ENABLE_ISL_ASSIST`
   flag. No model or flag is enabled in this phase.
3. Add camera consent, mirrored preview, camera-on status, stop/unmount cleanup,
   permission/no-device/busy errors, low-light warning, responsive accessible controls.
4. Implement a swappable adapter and Worker inference with bounded frame backlog;
   threshold/consecutive-prediction smoothing, explicit Confirm/Retry/Edit, phrase
   building, and multilingual `signs.json` derived from the approved label map.
5. Send only the reviewed phrase to existing chat with `input_mode: "isl"`;
   suppress automatic audio response in this mode. No camera frames, images or
   landmarks leave the browser; no biometric analytics. Preserve Text/Voice fallback.
6. Test adapter/smoothing/confirmation and camera error components. Manually test
   stop/unmount, permission dismissal, mobile orientation, keyboard/screen reader,
   high contrast/text scaling/reduced motion, unsupported signs and network failure.
   Inspect network requests to confirm absence of camera data. Measure held-out
   per-sign accuracy and false acceptance with multiple ISL users, backgrounds,
   lighting and signing speeds; include non-sign/no-hands inputs. Calibrate thresholds
   on validation data, never test data. Research metrics are not live-user accuracy.

Full-sentence translation and text-to-ISL animation remain future work. Phase 2–6
are deliberately not implemented until the model decision is reviewed, as requested.
