# AT-T1 core implementation report

P-3: v3 reviewed against the inherited LG-01–06 requirements; its fixed-input B0, observed-call failure behavior, additive schema, and successful-attempt linkage are accepted as the implementation contract. This report covers the core subtask only; privacy/UI work and unified acceptance are reported separately. No production deployment or commit performed.

Implemented:

- Exhaustive 14-site map; all Deep engine paths plus review recovery supply owner/session/operation context. Quick existing reservations retain their dispatch/retry behavior.
- Per-attempt nullable call metadata: site, stage group, provider host, prompt file fingerprints, parameter digest, finish reason, reasoning usage, teaching result metadata.
- Server-only payload storage with 90-day expiry, bounded 500-row cleanup at startup/write, account and owner/session cascade. Late results cannot recreate deleted-session payloads. No authentication headers or reasoning content saved.
- Successful attempt callback links coach messages to call records; fixed messages have no fabricated IDs. Legacy message projection preserves existing field order and excludes added metadata.
- Additive migration `0007_keen_sentinels`: no table rebuild or CHECK alteration; new fields remain NULL on old rows.
- Legacy Deep user-facing abort/timeout wording preserved while observational outcome distinguishes unproven disconnects from confirmed timeout.

Validation performed:

- 40 tests passed across `llm-calls`, `agent`, `request-parity`, `quick-request-parity`, `tutor-migration`, `tutor-observability`.
- Targeted ESLint passed for core LLM files and new tests.
- `npm run test:db` passed all empty/existing migration, ownership, deletion and replay checks.
- Full typecheck was clean before concurrent integration; root performs final unified check.

B0 provenance: fixtures were captured from an isolated `git archive 90f5655` checkout, running its real `generateJson`, `runAction`, and Quick API routes against fake fetch. `request-b0.json` covers 14 schema/prompt/client request bodies; `engine-b0.json` covers all 12 Deep logical sites and five additional revision-assist cases; `quick-b0.json` covers followup and check through actual routes. Expected bytes are frozen, not regenerated in tests. Current engine tests also add callId to prior messages and verify unchanged dispatched bytes. Fixtures contain synthetic student input and server prompt material and stay under tests, never public assets.

Additional evidence: tests verify reserved legacy row preservation, failed/truncated attempt followed by successful callId, reasoning-content exclusion, bounded deletion, payload-trigger failure without model failure, deleted practice preventing late payload insertion, account cascade, Quick API not returning payload fields, and Deep abort wording with indeterminate accounting.

Limits: no browser verification or production-data sizing in this subtask. Lifecycle cleanup is opportunistic startup/write cleanup as specified; this is not proof of wall-clock deletion at exactly 90 days on an idle service. Physical payload size depends on full context and histories, so actual per-practice storage must be measured on representative traffic. Full API/build leakage checks and unified T1–T6 acceptance remain root integration work. No real model used by these tests.

## Independent integration review follow-up

- Found and fixed configuration fingerprint omission: prompt file hashes alone did not change when only output schema changed. `prompt_version` now additionally hashes the actual dispatched system message, including schema, and lists the retry file only on an actual retry. Added stable/change/retry tests; no model request bytes changed.
- Identified damaged thread-map key/active-thread validation gap to root; thread agent implemented stronger stored-state validation.
- Added executable sentinel tests through real session GET/list/actions routes: synthetic private payload content is present in the database but absent from successful responses, failed provider responses, and logged payload-trigger errors. Invalid first-attempt content remains in server payloads; successful second-attempt ID is the one returned on the coach message. This is stronger than checking imports alone.
- Follow-up 6 boundary/parity tests pass; TypeScript remains clean.
- Scanned build `00O_wsZem7zVoksA5M42J`: 34 `.next/static` assets against 25 prompt-file prefixes (raw UTF-8 and JSON-escaped forms), zero matches. This identifies literal-prefix bundling, not arbitrary transformed text or semantic disclosure by a model. Any subsequent frontend build should rerun the scan.
- No production or real model calls were made. Retention cleanup remains opportunistic as explicitly specified; semantic prompt disclosure requires real-model evaluation and cannot be guaranteed by this storage boundary test.
