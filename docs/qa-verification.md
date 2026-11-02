# Multilingual QA verification

Implemented: selected reply language takes precedence over detected input language; consistent retrieval filtering and deduplication; numbered source references with citation validation; HTTP(S)-only source links; no unrelated first-service action; generation failures never substitute raw English excerpts; interrupted streams never restart into already emitted text; client detects missing saved completion and avoids automatically requeuing already-saved questions.

No database migration is needed. sourceNumber is an optional TypeScript property stored in existing citation JSON. Existing messages remain readable.

Checks: npm run lint; npm run build; node --import tsx --test src/lib/grounding.test.ts src/lib/qa.test.ts.

Live test: start the server, then set QA_TEST_ORIGIN to its origin and run node scripts/verify-qa.cjs. The script creates a temporary guest, asks an English scholarship question requesting Tamil and Hindi replies, checks citation numbers, reloads saved messages, compares content and citations, and deletes the temporary guest data in finally. It requires published embedded scholarship sources and working AI/database credentials.

Live results in this session: authentication and retrieval succeeded; generation failed first with an unavailable gemini-2.5-flash model (404), then timed out on gemini-3.8-flash, then returned high demand (503) on gemini-3.1-flash-lite. Test guest cleanup returned 200 each time. A successful live answer/history round trip remains unverified. Browser interaction and factual entailment for each citation need further evaluation; validating source IDs does not prove every claim follows from a passage. The existing similarity threshold remains a heuristic, not a calibrated relevance guarantee.
