# Sahayak Project Review

## Executive summary

Sahayak is a multilingual citizen-assistance web app and installable progressive web app (PWA). It combines a citizen portal and staff/admin console with AI-assisted question answering, service forms, document help, grievance tracking, and a nearby-office directory. The intended audience is people navigating public or institutional services in India, including users who prefer voice or one of 22 scheduled Indian languages plus English.

This is a substantial, feature-rich prototype rather than a fully connected government-service platform. The UI, server routes, PostgreSQL data model, AI/RAG pipeline, and staff tools are present. However, the default government integrations are explicitly sandbox placeholders; the DigiLocker action only marks a profile as linked; nearby-office data is incomplete; and successful live AI/database workflows are not established by this review. A local type check, production build, and all 33 focused unit tests passed.

**Most urgent findings:** the tracked [`.env.example`](./.env.example) contains populated credential-like values and should be treated as exposed; the WebSocket server accepts client-provided user and staff identity claims instead of deriving them from authenticated credentials; and the package's declared Node range is inconsistent with engine requirements reported by resolved Firebase dependencies.

## Project inventory

| Area | Contents and role |
|---|---|
| `src/` | Main React application, Express API, database schema/repositories, AI and speech providers, tests, and location-centre feature. |
| `src/components/` | Citizen screens, onboarding, shared UI, and the admin console. |
| `src/server/` and `src/middleware/` | API route registration, realtime WebSocket hub, authentication, and role checks. |
| `src/db/` | Drizzle schema, PostgreSQL connection, SQL setup, seed data, and repositories. |
| `src/lib/` | Gemini/RAG, embeddings, speech, scraping, Firebase, chunking, and ingestion. |
| `src/features/centres/` | Nearby-centre UI, API routes, local logic/tests, schema, and translations. |
| `docs/` | Feature implementation/verification notes for QA, embedding recovery, locations, and visual design, plus audit JSON. These are useful but do not replace a project README. |
| `scripts/` | Database/data setup, verification and diagnostic scripts, plus recorded audio test samples. Several scripts require live credentials/services. |
| `data/location/` and `public/location/` | District/office data, holidays, and the district-boundary manifest. |
| `public/` | PWA icons and static assets. |
| Root deployment/config files | `server.ts`, `package.json`, `vite.config.ts`, Docker Compose, Cloud Build, Cloud Run service config, Firebase app config, and environment example. |
| `dev-dist/` | Generated-looking service-worker/workbox output checked into the project; the Vite PWA plugin also generates build output. |
| `.agents/` | Bundled Supabase guidance/reference material, not application runtime code. |
| `.aistudio/` | Two AI Studio PDF artifacts; not part of the application runtime. |
| Root `*.diff` files | Historical theme/redesign patch artifacts. |

There is no top-level README, and the npm package is still named `react-example` with version `0.0.0`. Both `package-lock.json` and `bun.lock` are present, while the documented scripts use npm. Clarify the canonical package manager and add a single onboarding document.

## What the product does

### Citizen portal

The onboarding and citizen UI expose:

- Language selection, Google sign-in, phone/email OTP, and guest sessions.
- An assistant for asking service questions, with streaming answers, conversation history, source citations, and optional human handover.
- A service catalogue and guided application forms.
- Document storage, letter explanation, and form-field extraction.
- Application status, grievances, notifications, reminders, and profile/accessibility settings.
- A nearby help-centre directory.
- Speech input/output, PWA installation, and weak-network/offline affordances.

The responsive navigation is implemented in [src/App.tsx](./src/App.tsx); shared profile, language, authentication, API, and realtime state is in [src/context/AppContext.tsx](./src/context/AppContext.tsx).

### Staff/admin portal

The admin console and role-gated routes cover knowledge-base ingestion/review, integrations, workflows, language and translation management, human-support inbox, grievances, analytics, audit logs, and user/role administration. API authorization uses `requireAuth` and `requireRole` in [src/middleware/auth.ts](./src/middleware/auth.ts). The portal is a single-page application mode, not a separately deployed admin service.

## How it works

1. **Browser startup:** React mounts from `src/main.tsx`. Vite provides development middleware; in production, [server.ts](./server.ts) serves the built `dist/` assets and SPA fallback. The same HTTP server hosts API routes and `/ws`.
2. **Identity:** The browser uses Firebase Authentication for Google sign-in and exchanges/uses backend sessions. Phone/email OTP and guest sessions are represented in PostgreSQL. The browser keeps the active token in memory rather than local storage.
3. **Citizen API:** Express exposes public registries (languages, translations, services, sample TTS), authenticated profile/chat/document/application/grievance routes, and role-protected admin routes. Chat streams events over Server-Sent Events (SSE); updates are also broadcast over WebSockets.
4. **Grounded answers:** The chat route normalizes/detects language, retrieves published document chunks from PostgreSQL/pgvector using a Gemini embedding, supplies selected sources and service templates to Gemini, streams the answer, and persists the conversation and citations. Citation selection validates source references and only allows HTTP(S) source links.
5. **Knowledge ingestion:** Staff can stage web/document material, chunk it, generate embeddings, inspect ingestion state, and explicitly review/publish documents. The documented recovery flow avoids silently substituting lexical vectors or publishing failed ingestion.
6. **Storage:** Drizzle models PostgreSQL entities such as profiles/roles/sessions, language registries/translations, documents/chunks, conversations/messages, applications/events, grievances, notifications/reminders, workflows/runs, integrations, and audit logs. `src/db/setup.ts` creates the base schema and attempts to enable pgvector.
7. **Location feature:** A separate `help_location` schema stores district/centre data, consented district preferences, aggregate reports, and holidays. The browser requests GPS permission and would map coordinates against a local boundary manifest; district selection remains manual when the manifest is unavailable.
8. **Deployment:** Cloud Build deploys to Cloud Run on port 3000 with health probes and public ingress. Runtime secrets and database connectivity must be provided outside the checked-in deployment YAML.

## Technology

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons, Motion, and browser APIs.
- **Backend:** Node.js, Express 4, TypeScript via `tsx`, WebSockets (`ws`), and SSE.
- **Persistence:** PostgreSQL 16/pgvector, `pg`, Drizzle ORM/Kit, JSONB, and hand-authored setup SQL. Docker Compose provides a local pgvector PostgreSQL service.
- **Identity:** Firebase client SDK and Firebase Admin SDK, plus application-managed OTP/guest sessions.
- **AI and language:** Google GenAI SDK/Gemini for generation, embeddings, document processing and fallback speech; Sarvam AI for Indic speech/translation where configured; Cheerio for extracting web content.
- **PWA/deployment:** `vite-plugin-pwa`/Workbox, Docker Compose, Google Cloud Build, and Cloud Run.

## Running locally

The shortest path is:

1. Install a Node version compatible with the resolved dependencies (see the engine mismatch below).
2. Provide PostgreSQL 16 with pgvector, then set database, Gemini, Firebase, and session configuration locally. Sarvam is optional. Do not copy the populated credential-like values in the current `.env.example`; create a local `.env` with rotated credentials and safe values. `.env` is ignored by Git.
3. For local PostgreSQL, run `docker compose up -d`; then run `npm ci`, `npm run db:setup`, and `npm run dev`.
4. For a production build, run `npm run build` and `npm start`. Cloud Run also needs database and provider secrets supplied out-of-band; they are not configured by the checked-in Cloud Build YAML.

The npm scripts also expose Drizzle `db:push`, `db:generate`, and `db:studio`. Focused tests can be run with:

```powershell
node --import tsx --test src/lib/embeddings.test.ts src/lib/grounding.test.ts src/lib/qa.test.ts src/lib/speech.test.ts src/features/centres/core.test.ts
```

## Implementation status

| Capability | Status based on code, docs, and review |
|---|---|
| Multilingual UI | The registry defines 22 scheduled Indian languages plus English. Full UI dictionaries are bundled for nine non-English languages; other languages can be translated dynamically and cached when an AI provider is available. Language registration is not proof of complete human-reviewed translation or equivalent speech quality. |
| AI Q&A | RAG, streaming, language handling, citation validation, and focused unit tests are implemented. It depends on configured Gemini credentials, published/embedded data, a reachable database, and currently available model IDs. Existing QA notes record live generation failures/timeouts/high-demand responses; no live end-to-end question/history round trip was run here. |
| Speech | Provider integration, validation, fallback/error behavior, and language-hint tests exist. Actual provider availability, account quotas, audio quality, and every device/browser combination were not tested. |
| Forms and applications | Service templates, guided forms, database submissions, status/events, and workflow hooks exist. The available code does not establish that a submitted application is sent to a government system. |
| DigiLocker | **Not a real OAuth link in the current route:** `/api/documents/digilocker-connect` sets profile fields and returns an adapter mode/reference. It does not show a consent/authorization/code-exchange flow. |
| Integrations | Default connectors point to `.example` sandbox addresses and are marked untested. Sandbox “tests” validate the URL/schema contract; they do not prove a government gateway works. Live execution requires configured endpoints/secrets. |
| Workflows | Triggered workflow runs and in-app notification creation are implemented. Other step types can be recorded as completed log entries without performing a corresponding external office dispatch or integration action. |
| Nearby centres | The repository contains 38 districts and 33 welfare-office records. The boundary manifest explicitly says verified boundary data is unavailable, so GPS-to-district detection is not ready. Data has no verified centre coordinates, office hours, or holidays (the holiday list is empty); distance sorting and several centre-type filters therefore have limited or empty results. Existing location docs also state the directory is not a complete catalogue of CSC/e-Sevai/college facilities. |
| Offline/PWA | Install prompt, service-worker precaching, public API cache rules, connectivity status, and a question queue are implemented. The queue and answer cache in the hook are React state only, so they are not durable across reloads; this is limited offline assistance, not a complete offline app. |
| Visual redesign | The docs describe a two-colour design audit and source changes. The current build verifies compilation, not browser rendering, raster-icon colors, or accessibility across real devices. |

### Local location data

The checked-in JSON currently has 38 districts, 33 centres (all `welfare`), and zero holiday records. The location feature's own docs caution that the source directory lacks verified coordinates, hours, and required-document lists. Opening status is unknown when hours are absent; the UI should not be treated as a verified “open now” directory.

## Strengths

- Clear modular boundaries between citizen UI, staff tools, API, persistence, AI, and the separately lazy-loaded centre feature.
- Good safety intent in AI answer generation: grounding instructions, citation/source-number validation, HTTP(S)-only citations, no raw-English fallback on generation errors, and explicit mention when no sources match.
- Knowledge ingestion tracks failures/provenance and requires review/publication instead of treating generated data as verified by default.
- Strong focused tests for embedding error classification and vector validation, citations, speech input normalization, and location logic.
- Accessibility and low-bandwidth needs are considered through native-language labels/fonts, RTL handling, text scaling, voice controls, responsive layouts, and PWA support.
- Privacy-conscious choices exist in the location feature: coordinates stay in browser memory, preference persistence requires consent, preference withdrawal deletes stored data, and live location reports are aggregated.
- Deployment has health endpoints, startup handling, request/server timeouts, graceful shutdown, and a local PostgreSQL/pgvector development option.
- Existing feature notes are unusually candid about unverified data and failed live checks; the review preserves those caveats rather than calling every UI surface production-ready.

## Risks, defects, and limitations

### High priority

1. **Credential exposure:** The tracked `.env.example` contains populated credential-like values, including a database credential, rather than only safe placeholders. Do not copy or reuse those values. Treat applicable credentials as exposed: rotate/revoke them, remove them from the example, use a secret manager, and consider repository-history cleanup. No values are repeated here.
2. **Unauthenticated realtime identity claims:** [src/server/wsHub.ts](./src/server/wsHub.ts) accepts `userUid` and `isAdminOrAgent` from a WebSocket subscription message and uses those values to choose user/admin broadcasts. The socket setup shown does not verify a session or derive roles server-side. Authenticate the handshake/subscription and authorize recipients from trusted server state before exposing this channel publicly.
3. **Weak fallback session secret:** The repository code falls back to a fixed `SESSION_SECRET` value when configuration is absent. Production should fail startup when a strong, independently generated secret is missing; rotate any prior secret that may have been used.
4. **External service flows are placeholders:** Default government, DigiLocker, and notification integrations are sandbox/test entries. The DigiLocker action is a profile flag, and workflow logging is not equivalent to dispatch. Avoid describing these as live public-service integrations until real provider contracts, authentication, consent, error handling, and end-to-end tests exist.

### Medium priority

5. **Runtime-engine mismatch:** `package.json` allows Node `>=22.6.0`. On Node 22.18, `npm ci` warned that multiple resolved Firebase packages require Node `>=24.12.0`. Typecheck/build passed here, but the declared support range is not validated for the resolved runtime dependency graph. Pin compatible dependencies or raise/test the supported Node version.
6. **Dependency vulnerabilities:** `npm ci` audited 723 packages and reported 20 vulnerabilities (2 low, 14 moderate, 4 high). This is an aggregate install-time report; affected package paths and runtime reachability were not investigated in this project review. Review a current audit report and upgrade deliberately rather than applying a breaking bulk fix.
7. **Incomplete live acceptance evidence:** Existing QA documentation records failed live Gemini attempts, and no database-backed API, browser, or provider end-to-end checks were run for this review. The isolated tests do not establish service readiness or factual answer quality.
8. **Location data gaps:** GPS detection is unavailable without reviewed district polygons. Centre geocoding, hours, holiday records, and non-welfare directory coverage are missing. Until data onboarding is complete, manual district selection and call-before-travel messaging are the honest behavior.
9. **Bundle-size warning:** Production build emits a 665.19 kB main JavaScript chunk (176.20 kB gzip), above Vite's 500 kB warning threshold. The centres screen is already a separate lazy chunk; further splitting of the primary bundle is warranted.
10. **Health semantics:** `/healthz` and `/_ah/health` return success without checking database or AI availability. `/readyz` reflects route initialization, not a full dependency readiness check. These are useful startup/liveness probes, but operators need separate dependency-aware monitoring.

### Lower priority / maintainability

- No top-level README or single setup guide; environment, database, deployment, and feature acceptance instructions are distributed across config and `docs/`.
- `package.json` lacks a `test` script and labels the project `react-example`; both npm and Bun lockfiles exist.
- The project includes tracked generated service-worker output, large patch artifacts, two AI Studio PDFs, and bundled third-party agent references. Document which are maintained source versus generated/reference artifacts.
- Workflow, integration, and translation claims should be labeled clearly in the UI when operating in sandbox, unreviewed-auto-translation, or unavailable-provider modes.

## Validation performed for this report

| Check | Result |
|---|---|
| `npm ci` | Succeeded; installed 722 packages. Reported engine warnings and 20 dependency vulnerabilities. |
| `npm run lint` | Passed. This script is `tsc --noEmit`; there is no separate ESLint command. |
| `npm run build` | Passed. Vite generated the PWA assets; main chunk-size warning remains. |
| Focused tests | Passed: 33 tests across `embeddings`, `grounding`, `qa`, `speech`, and `features/centres/core`. |
| Location JSON inventory | Confirmed 38 districts, 33 welfare centres, and no holiday rows. |
| Live database / Gemini / Sarvam / browser tests | Not run. These need a deliberately configured database/provider environment and were outside this report's available validation. |

Existing docs report additional historical live/acceptance results for embeddings, QA, locations, and the visual redesign. Those results are cited as prior project notes, not independently revalidated here.

## Suggested next steps

1. Rotate exposed credentials and remove them from tracked examples/history; require a production session secret and provision secrets out-of-band.
2. Authenticate WebSocket connections and derive subscription identity/roles on the server.
3. Decide and document the supported Node version; reconcile `engines` with installed Firebase dependencies and lockfile policy.
4. Add a README with setup, required environment variables (names only), database bootstrap, migration/update procedure, test commands, and deployment assumptions.
5. Distinguish sandbox/demo behavior from production in user-facing screens; implement real integrations only against approved provider sandboxes and verify end-to-end.
6. Complete and provenance-review the Tamil Nadu boundary/office dataset, then add real directory hours, coordinates, holidays, and more office types.
7. Add credential-gated API/browser smoke tests for auth, chat persistence/citations, application/grievance flows, admin roles, and centres consent/reporting.
8. Review dependency advisories and bundle composition; add a maintained test script and CI checks for typecheck, unit tests, build, and dependency policy.

## Overall assessment

The project has a strong prototype foundation: the user journey is broad, the architecture is cohesive, and the AI/data modules include more careful failure and citation handling than a typical demo. Its largest gaps are not missing screens; they are production trust boundaries and operational proof. Until credentials are rotated, realtime subscriptions are authenticated, sandbox integrations are accurately labeled, and database/provider-backed workflows pass repeatable acceptance tests, treat Sahayak as a promising demonstration/prototype rather than a deployable citizen-services system.
