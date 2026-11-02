# Gemini embedding recovery — 31 October 2026

## Cause and implementation

The shared embedding function hardcoded `text-embedding-004`, which returned HTTP 404. It hid permanent errors by returning null, accepted padded/truncated vectors, and used incompatible lexical fallback vectors for citizen queries. The worker continued through chunks and reported every failure as rate limits/network issues. In the inspected code, its application retry classifier already excluded 404, but swallowed errors and SDK-level retries obscured that distinction.

The replacement uses installed `@google/genai` 2.32.0, `models.embedContent`, Gemini API `v1beta`, and `gemini-embedding-001`. Model metadata and a real embedding were verified with the configured project key before implementation. Google documents this model as still supported for text embedding: https://ai.google.dev/gemini-api/docs/embeddings . Model capability inspection: https://ai.google.dev/api/models .

Both retrieval documents and queries request 768 dimensions, with RETRIEVAL_DOCUMENT and RETRIEVAL_QUERY respectively. Returned vectors are validated and normalized; there is no padding, truncation, empty-vector conversion, or lexical fallback. The live database column is `vector(768)`, matching Drizzle and setup SQL. No database schema migration or package upgrade was necessary.

Structured failures include HTTP status, Gemini code, model, message, category, and retryability. HTTP 400/401/403/404 fail immediately; 429 and 500/502/503/504, timeouts, and network failures use bounded exponential backoff with jitter. SDK internal retries are disabled for embeddings. Permanent configuration failures require a successful configuration probe before the admin interface can resume processing.

Document-level JSON metadata records model/dimension provenance. Retrieval excludes null embeddings and documents lacking matching provenance. Existing vectors of unknown/different provenance are preserved and blocked from mixing; they require a separate planned re-embedding operation. Live inspection found no pre-existing non-null vectors in this database.

## Preserved NSP document

Document 1, https://scholarships.gov.in, retained its 3,933-character extracted text and seven staged chunks. All seven embeddings were generated and saved. Integration assertions checked document title, text, URL, language, domain, file data/type, chunk IDs, page numbers, content, and ordering. No website fetch, deletion, duplicate creation, or table reset occurred.

The document remains `stored`, with review and explicit approval required before publication. Retry no longer publishes automatically. A transaction temporarily exercised the published retrieval path and then rolled back. The citizen query returned all seven NSP passages with title, URL, page and language metadata; top cosine similarity was approximately 0.73645. Normal retrieval excludes the unpublished document.

## Changed files

- src/lib/embeddings.ts — shared embedding configuration, validation, errors and retry policy.
- src/lib/embeddings.test.ts — error classification, HTTP request count, retry, normalization and dimension tests.
- src/lib/gemini.ts — shared exports; source URL in generated citations.
- src/lib/ingestionWorker.ts — preserve staged content, resume null embeddings, provenance and accurate failure status, no automatic publication.
- src/db/repositories.ts — validated writes, database failures propagated, transactional non-destructive staging, compatible retrieval with source URL.
- src/db/schema.ts and src/types.ts — optional source URL in citation types; vector column unchanged.
- src/server/appRoutes.ts — configuration verification and processing/review/publication gates.
- src/components/AdminConsole.tsx — permanent-error verification action and publication controls.
- src/components/CitizenAskAndExplain.tsx — clickable source URL in citation detail.
- scripts/inspect-embeddings.ts — read-only live schema/document inspection.
- scripts/verify-embeddings.ts — guarded NSP recovery and integration checks.
- docs/embedding-recovery.md — this report.

Existing unrelated workspace edits were retained.

## Commands and validation

```powershell
npm run lint
npm run build
npx tsx --test src/lib/embeddings.test.ts
npx tsx scripts/inspect-embeddings.ts
npx tsx scripts/verify-embeddings.ts
```

The final two commands require configured .env credentials and network access. The verification script targets document 1, resumes missing embeddings, and leaves it stored for review. Run it only while that document is intended to remain unpublished.

TypeScript/lint passed (`lint` is `tsc --noEmit`; there is no separate ESLint script). Production build passed with a bundle-size warning. All 14 embedding tests passed, including one HTTP request on 404 despite four allowed attempts and successful retry after 429. Live model availability, embedding generation, seven vector insertions, similarity retrieval, metadata preservation and idempotent document retry passed. Browser interaction and generated answer text were not exercised; citation metadata was verified through retrieval and the citation UI compiled successfully.
