# Question-bank-first practice with soft guidance

- **Author:** uli-chen (product direction); initial brief compiled by Claude Code; revised with Codex team feedback.
- **Created:** 2026-10-31. **Revised:** 2026-11-01.
- **Status:** RFC, revised for team feedback; one independent revision-review round completed, with four follow-up defects fixed and confirmed closed (2026-11-01). The owner requested the review fixes and provisionally adopted the bank size and Quick limits on 2026-11-01. This specifies proposed behavior; it does not describe deployed features or authorize a production release.
- **Current source of truth:** this RFC. The historical brainstorming input `concepts_brief.md` was removed on 2026-11-16; see Git history.
- **Review inputs:** [team review](../reviews/question_bank_first_practice_team_review_20261101.md). [Previous RFC snapshot](../reviews/question_bank_first_practice_rfc_before_20261101.md) retains the original Round 1/2 decisions and review history.

## 1. Current proposal and scope

project 0 helps Chinese students practise IELTS Writing Task 2 using their own ideas. The coach asks questions and identifies gaps; it does not supply arguments, model essays or templates. The prior specification used a mandatory onboarding mock and a weekly task plan. The owner wants easier entry, less repeated focus and more freedom to practise different material.

The current proposal is topic-first. Home shows a Continue action, a due checkpoint invitation, an unranked topic list and a last-topic shortcut. The student chooses a topic; code recommends one question and activity inside it. The whole bank remains available for free choice. There is no coverage grid, automatic topic ranking, agent-selected question or mandatory first mock.

- **Quick:** the student writes an outline; up to two focused follow-ups and a bounded check produce a topic card. No band score, and no T/L issue-memory update.
- **Deep:** a full original essay, scoring and feedback, with optional revision and comparison. Finishing useful work does not wait for optional model-written closing text.
- **Topic cards:** a reviewable form of the student's own material, grouped by topic. They replace, rather than duplicate, the planned student-facing idea-material store. Automatic extraction from Deep essays is deferred.
- **Pace:** show separate Quick/Deep completion counts against the student's weekly target, with provisional planning estimates of 10–15 minutes for Quick and 45–60 minutes for Deep practice. These are planning estimates, not time limits or measured results. A mock uses the 40-minute condition below. Missed activities do not carry forward; pace never chooses the next question.

The first release described here includes the catalog, topic browsing, cards, continuation into Deep, deterministic recommendation, completion/exposure records, bounded Quick calls, and checkpoint qualification. Recurring-focus attachment is included only when the taxonomy contract in section 6 passes its acceptance cases; otherwise the explicit release setting is **focus off**, and recommendations carry no focus. Checkpoints must likewise remain off until their qualification and migration cases pass. A staged release must name disabled features; it cannot claim the full RFC has shipped.

Topic-first only nudges breadth through counts and “not practised yet.” It does not guarantee broad topic choice. A pilot may justify a later weak nudge; this RFC does not restore compulsory topic sequencing. Task 1, other exam sections, rewards, agent planning and app implementation are outside this document-editing task.

## 2. Canonical bank and provisional mock catalog

Use one versioned catalog, with **38 questions: 28 ordinary practice questions and 10 checkpoint-reserved questions**.

| Allocation | Provisional rule |
| --- | --- |
| Practice | Exactly 4 primary-topic questions in each of education, technology, environment, society, work, health, culture: 28 total |
| Reserved | Exactly 2 of each question type: agree_disagree, discuss_both, adv_disadv, problem_solution, two_part: 10 total |
| Type coverage | All five types occur in the practice pool; a complete topic × type matrix is not required |

The editable fixture is [question_bank.mock.json](../../data/question-bank/question_bank.mock.json); its [README](../../data/question-bank/README.md) records sourcing, counts and validation. It is a mock catalog for design and local testing, not an installed production bank. Local material from `/Users/chen/Desktop/雅思` is reused where suitable; adaptations and synthetic supplements remain explicitly labelled. Do not claim every fixture question is an authenticated official past question. The product's intended past-question bank still needs its publication-ready content review; this task does not deploy or publish these files.

Each entry has: stable `id`; integer `version`; `exposureKey` for the question family; unique `bankOrder`; English `text`; one `primaryTopic`; optional `secondaryTopics`; reviewed `questionType`; `pool` (`practice` or `checkpoint_reserved`); source kind/path/locator/file SHA-256/note. `bankVersion` identifies the catalog release. Exclude Task 1 prompts, essays and answer material. Counts use the primary topic only; secondary tags do not multiply completions.

An exposureKey groups exact or substantially equivalent wording of the same task. Reserving a reworded copy of a practice question does not create an unseen checkpoint. Cosmetic corrections increment version while retaining ID and exposureKey. A substantively different task gets a new ID/key; changing IDs must never reset known exposure. Attempts retain the catalog version, prompt text and tags they started with. For historical counters use that frozen primary topic/type; current availability and ordering use the current catalog. Do not rewrite old prompt snapshots after catalog updates.

For six weeks at three ordinary activities a week, 28 practice questions exceed 18 possible new-question activities across the whole bank; a single topic can still exhaust its four questions. A checkpoint near day 0 followed every 14 days gives at most three invitations in [0,42 days), or four including a day-42 closing checkpoint. Ten reserves are a starting buffer, not a guarantee: free practice, prior history and type allocation can consume it. Use the explicit unavailable state when supply runs out.

## 3. Data meanings and ownership

These are logical records and invariants, not a prescribed SQL layout. Existing session JSON remains the content store; add only the small persistent records needed for these rules.

| Record | Required meaning |
| --- | --- |
| Attempt | Immutable activity `quick` or `deep`; separate mode `practice` or `mock`; user, question ID/version/exposureKey and prompt snapshot; creation time; latest student-action time; open/set-aside/closed state; schemaVersion separate from the existing optimistic-write version |
| Relationships | `continuedFromQuickId` and frozen card-version snapshot for a Quick continuation; `rewriteOfDeepId` for a Deep rewrite. These are distinct relations, not one overloaded sourceAttemptId. A Deep may have both if it uses a card after prior Deep work |
| Card | Exactly one per (user, Quick attempt); monotonically increasing contentVersion; structured student content/provenance; current check state; last check's contentVersion and check ID |
| Completion | One immutable event per (user, attempt), with activity, question family, frozen primary topic/type, completedAt, originalSubmittedAt (nullable for legacy), freshness (fresh/repeat/unknown), relationship classification and an evidence-present/deleted marker. Session completedAt is only a projection of this event |
| Familiarity | Minimal user × exposureKey facts: first attempt, whether any Deep original was submitted and its first submission time if known, whether prior Deep feedback was made available, external-practice declaration and any unresolved legacy-exposure status |
| Model operation | User/attempt/card version, operation kind, logical operation ID, request/idempotency key, budget package, provider attempts, reservation/usage/time/failure result and configuration version; no essay text in usage logs |
| Checkpoint record | Qualification snapshot at start, timed-submission conditions, declaration, catalog/alias versions, completion result, baseline/trend eligibility and reason codes |

An attempt's activity never changes. Quick→Deep creates another attempt. Completed work may remain open for optional editing/revision; “completed” is not “closed,” and “set aside” is not “deleted.” Save-for-later keeps the work; an explicit **Set aside** suppresses automatic resume until the student manually resumes it. Opening a page does not change latest student-action time or recommendation order.

Deleting an attempt deletes its essay/chat content, card and content-bearing check evidence. It retains the minimal familiarity facts, completion/submission markers and non-content budget/operation ledger needed to prevent renewed unseen status, duplicate/misdated statistics and quota resets. Keep originalSubmittedAt and fresh/repeat/unknown on deleted completed-original markers; retain call start times, reserved/known/unknown usage and failure categories even if their source attempt content is deleted. The deletion UI says that text is removed while practice totals and previously-practised status remain. These retained records contain no essay, source excerpt, diagnosis text or score. Counters include these completed-history markers; card counts include only surviving cards. Deleted evidence cannot support recurring focus or be displayed as feedback. Deleting an account deletes all these records, quotas and content.

A Deep continuation is separate work: deleting its source Quick removes the Quick/card but not the Deep's already-copied snapshot or essay. Deleting the Deep does not delete the Quick. Explain this at deletion; a dangling content link displays “source deleted,” while relationship IDs can refer to minimal retained attempt markers. No deleted text is reconstructed. Deleting a baseline removes its score/content and leaves a “baseline deleted” marker; do not silently promote a later score to the original baseline. Checkpoint scheduling may still use its retained completion date.

## 4. Topic cards, provenance and Quick→Deep

Card fields follow the actual question: both views plus opinion for discuss_both, paired problems/solutions for problem_solution, both requested answers for two_part, and an appropriate position/reason structure for the other types. Do not require the old universal two-reasons-plus-counterargument template. A check asks whether the student answered the task and supplied relevant reasoning; it does not score a band or mechanically require inapplicable slots.

Every content part has one honest provenance form:

1. **Direct edit:** student user ID, server-recorded edit ID/time, card contentVersion, exact entered text. No fabricated message ID.
2. **Selected excerpt:** that user's source message ID, character offsets and exact excerpt. The server verifies ownership, user role and matching original text. Editing the excerpt creates a direct-edit record for the new text; it does not retain a false exact-quote claim.

Record whether the source was entered after a coach follow-up. This records the context, not proof of independent authorship. Model messages may identify gaps but never write card content. Reuse prewriting conversation/UI only where compatible; do not copy the current model-generated outline slot text into a published card. The existing path in `lib/pipeline/engine.ts` validates a quote but saves the model's own text, so it cannot enforce this invariant unchanged.

Card states are `draft`, `needs_development`, `passed`, `unchecked`. A check-in-progress or technical failure is operation status, not a student ability judgment. `unchecked` means an edited previously-checked card and is a resumable draft subtype. The review view defaults to passed cards at their currently checked version; the question history exposes every surviving state and a resume/recheck action. Editing a passed card changes it to unchecked without removing its original completion credit. Save/resume/recheck retain the same card ID.

A check captures immutable card version v before calling the model. Commit its result, card state and first completion event in one short transaction after the call; only apply the result if v is still current and the attempt/account still exists. A stale result may remain operation metadata but cannot pass new content or recreate deleted work. A valid “needs development” result names the gap and keeps the draft. Timeout, invalid JSON and quota exhaustion preserve content and remain technical outcomes. A retry or later pass never adds another Quick completion event.

**Continue to Deep:** available from a saved Quick card, including a draft. It creates a Deep/practice attempt with the same prompt family and a frozen card-content/provenance/check-state snapshot. No model-written material is added. A default-continuation mapping unique by (user, Quick attempt) returns the same child on repeated clicks, refreshed request IDs or lost responses. This uniqueness applies to the default child, not to every explicitly requested later practice that may cite the same source card. Once that child exists, the default action is Open Deep; a separate explicit New practice action is required for another attempt. If the default child was deleted or explicitly abandoned, say so and require an explicit New practice action rather than silently recreating it. That action creates a separate attempt with its own idempotency key, may copy the current saved card snapshot, and does not overwrite the default-child mapping. Source-card edits do not alter the child. Quick and Deep may finish in different weeks and each earn exactly one credit when its own completion condition is met.

## 5. One completion definition for every consumer

- **Quick:** the first valid check that passes the current card version and commits successfully.
- **Deep:** the first successful persistence of the submitted original's required scores and actionable issue feedback, with the feedback available to the student. This is the precise meaning of the earlier phrase “feedback first shown.” Actual viewing is optional separate `feedbackViewedAt` telemetry, not a condition for credit.
- Outline-to-essay review, revision/comparison and closing/plan wording are optional. Failure of one cannot remove or prevent completion once the required original feedback is committed. A partial score without required feedback earns nothing. A failed optional review must be labelled separately from a failed core evaluation.

All of weekly counts, topic exhaustion, first checkpoint invitation, question-type counts, history labels and pilot metrics consume the same completion events. A completed Deep can still offer revision in history, but is not unfinished for the primary Continue recommendation. Original-submission time is server-recorded when the original snapshot is accepted; completedAt is the successful required-feedback commit time. Both are immutable; optional retries and later edits do not move them.

Weekly product counts use Monday 00:00 through the next Monday in Asia/Taipei, storing UTC timestamps. A Sunday start completed Monday belongs to Monday's week. Quick followed by Deep earns two activities, but topic breadth counts that question family once. Topic counts show distinct completed questions plus a separate started-only count; card counts show current passed and draft/unchecked cards separately. “Not practised yet” means no attempt record, not merely no completion. Timeouts and drafts are not completed questions.

Historical `finished` sessions can be marked legacy-completed for all-time counts if that old state is present. Their completion event has `completedAt=null` unless a trustworthy historical completion timestamp exists. Do not infer it from createdAt, updatedAt or migration time. Unknown-time records are excluded from dated weekly totals, recency ranking, pilot comparison, checkpoint scheduling and fresh-original recurrence. They appear in an explicit unknown-date historical count; only known-date Deep completions satisfy recommendation exhaustion and first automatic checkpoint invitation. Merely having legacy evaluation does not prove the required feedback completed. An already legacy-completed event stays unknown-date after regrading; only trustworthy evidence of its original historical completion may fill that missing historical date. Regrading records a separate feedbackUpdatedAt and never a new credit, current-week completion or first-checkpoint trigger. A legacy session with no previous completion event can earn a new current completion only when it genuinely first satisfies the required-feedback contract after migration.

## 6. Deterministic recommendation and recurring focus

### Home and recommendation pool

Home order: (1) the most recently student-edited open, uncompleted, non-set-aside attempt, (2) a due checkpoint invitation, (3) the unranked topic list, (4) last-topic shortcut. Continue can include a reserved question the student deliberately chose. A running operation displays its status and does not create another attempt. A due checkpoint never forces abandonment of current work.

Inside a topic, define P as the **currently active, non-reserved questions with that primaryTopic**. Reserved questions remain in the full bank with a reserved badge and a note that practising them uses their checkpoint eligibility; they never enter this topic recommendation, including its resume branch. Their direct history/resume links still work.

**Blocking work** means an open uncompleted Deep original, an open Quick card in draft/needs_development/unchecked state, or an actively started optional Deep revision that has not been closed. Include Set aside work in this exclusion. A passed Quick and a completed Deep with no active revision do **not** block another activity merely because their session is still open. Resume prioritizes required unfinished work and card rechecks; optional revisions remain accessible in history. Every branch that starts new work, including exhausted-topic rotation, uses this same exclusion.

The question-selection branches below are terminal; activity selection, type ordering and optional focus are separate steps. Stable sorting never depends on page loads or model wording.

1. **Resume:** among open, uncompleted, non-set-aside attempts on P, select latest student-action time, then latest creation time, then lexicographic attempt ID. Include Deep drafts and Quick draft/needs_development/unchecked cards. A previously completed Quick whose edited card needs recheck is included despite having historical credit. Resume keeps the existing attempt, activity and focus; do not create anything.
2. **No ordinary pool:** if P is empty, return `no_practice_questions`, with the full bank and another-topic actions.
3. **Exhausted:** if every question in P has a known-time Deep completion, first remove questions blocked by existing work as defined below. If none remain, return `only_saved_or_unavailable_work`. Otherwise select the remaining question with the oldest *latest* such completion; tie by bankOrder. Recommend Deep rewrite linked to the latest completed Deep marker on that family. If its text was deleted, show that fact and offer a blank same-question rewrite, never restored content. After completion, that question becomes the most recently completed one. Other topics remain available without auto-ranking them.
4. **Untouched candidates:** P with no familiarity attempt record and no blocking work.
5. **Fallback candidates:** if branch 4 is empty, P without a known-time Deep completion and without blocking work. This includes a completed Quick, a closed/abandoned attempt, or deleted work with retained familiarity. Starting again after abandonment/deletion is explicit and preserves past exposure.
6. **Nothing selectable:** if both candidate lists are empty, return `only_saved_or_unavailable_work`, show saved attempts and manual topic selection. Do not silently override Set aside or manufacture a new attempt. Every legal input has either a recommendation or a specified empty result.

For a candidate in branches 4–5, prefer the question type with the fewest distinct completed question families across all topics and both pools; count a family once even if Quick, Deep and several rewrites completed. Tie by bankOrder. Recommend Quick only if the topic has neither historical Quick completion nor known-time Deep completion; otherwise recommend Deep. A card is reusable material, not a readiness test. If Deep is selected and a surviving Quick card exists, offer its normal continuation action. An existing active default child is handled by resume/blocking rules. For a deleted or explicitly abandoned default child, recommend the clearly labelled New Deep practice action, requiring confirmation of that action rather than an automatic replacement; it preserves the old default-child mapping. An attempted question without usable card material can still be practised in Deep. Free choice of either activity remains available.

### Fresh originals and canonical issue codes

Each user's first accepted Deep-original submission for an exposureKey is the only potentially fresh original on that family. Further submissions on the same family, whether started through a recommendation, free choice, a new ID alias or a rewrite button, are repeat evidence. A known prior feedback marker also makes a later submission repeat evidence. Revision submissions never qualify. Quick coaching alone does not disqualify the first Deep original; record assistance/mode, and distinguish it from a timed checkpoint. An explicit rewrite relation always disqualifies freshness. Allocate this first-submission fact atomically, so parallel free entries cannot both be fresh.

For focus, select the **two latest completed fresh-original markers**, ordered by originalSubmittedAt and then attempt ID, including markers whose essay evidence was deleted. Only after selecting the two positions check whether their evidence survives. Both must still have usable feedback evidence and the same supported taxonomy version. Do not replace a missing, deleted or unknown-code result with an older convenient essay to manufacture two supporting results: insufficient evidence means no focus. A code qualifies only if it was positively reported in both, fits the chosen question type and is not excluded by the student. T06 is limited to agree_disagree/discuss_both. Tie among qualifying codes by the declared taxonomy order; the explanation cites the actual two essays and dates. Focus never changes the selected question. Missing from a short issue list means “not reported,” not “assessed absent” or “resolved.”

New diagnosis inputs supply the versioned code definitions; outputs validate against that code set with essay evidence. Current `evaluation.issues[].code` is a free string and the current scoring prompt does not provide the taxonomy: copying that contract into the new rule is insufficient. Unknown or legacy free codes may remain visible as historical feedback but cannot be guessed into T/L codes or qualify for this rule. If the two selected originals lack valid taxonomy evidence, omit focus. A focus-enabled release must validate this contract; no focus is the deliberate fallback.

## 7. Checkpoints, prior practice and deletion

The baseline claim is deliberately limited: **a timed, unassisted original on a question not previously practised in this app, with the student reporting no prior outside practice**. It is not proof that the student has never seen the text. Browsing the public bank alone does not disqualify under this definition. UI wording must communicate this limited claim rather than an unqualified “independent unseen question.”

First automatic invitation: after the first known-time Deep completion, unless an eligible checkpoint already completed. Thereafter, due 14 days after the last eligible checkpoint's completedAt. Skipping sets deferredUntil to now + 7 days; skipping again moves that deferral forward. Failed, abandoned and ineligible repeat mocks do not reset the 14-day clock. Before any eligible completion, the first invitation remains due except during deferral. Creating a checkpoint sets an in-progress action rather than showing another start invitation.

States: `available` (due and a possible qualified question exists), `deferred`, `in_progress`, `unavailable` (due but none eligible). Unavailable offers a clearly labelled repeat mock that cannot establish or update the eligible baseline/trend. Selection prefers eligible reserved questions, then eligible ordinary questions; within a pool prefer the type with fewest eligible checkpoint completions, then bankOrder. Availability is provisional until the start transaction and declaration check.

At start, require no prior app attempt on the exposureKey, known legacy exposure and an explicit outside-practice declaration (`no`, `yes`, `unsure`). `yes` marks external practice; `unsure` marks unknown; neither qualifies. Show another candidate or an ineligible mock option. The declaration alone cannot erase app attempts or unresolved legacy history. Check eligibility before creating this attempt's exposure record, so the attempt does not disqualify itself. Persist the decision/evidence and allocate the active checkpoint atomically; the same user cannot start two active checkpoints, or another attempt on that family while a qualifying checkpoint is in progress. Use existing single-process controls and short transactions; no new distributed platform is assumed.

A qualifying checkpoint is Deep/mock: no coaching or card material before the original is submitted, 40 minutes of server wall-clock time from start, no pause/reset on refresh. The original must be accepted by the deadline; late submissions can still receive feedback but become ineligible. Timer pauses, client-reported elapsed time or later retries cannot turn a late submission into an on-time one. Scoring may finish after the deadline; preserve the original submission time. On completion, verify stored start qualification and timing/assistance facts again. The first completed eligible checkpoint becomes the immutable baseline reference; later eligible results form its trend. Practice scores and ineligible/unknown mocks are displayed separately. Deletion behavior is defined in section 3.

An attempt-start or prior-practice record survives deleting the essay, so a practised reserve never becomes unseen by cleanup. A newly registered user with no imported history has known app history. For existing users, resolve old built-in IDs and uniquely matching normalized text through a versioned alias map (Unicode NFKC, case-fold, whitespace collapse; no fuzzy guess). Ambiguous or unmatched old content creates uncertainty: conservatively mark **all exposureKeys in the catalog at the migration cutoff** unknown for that user until the unmatched history is resolved. Resolving an alias recomputes the affected uncertainty while preserving positive attempt facts. Truly new question families added after that cutoff can be known if they are not equivalent to an old task; relabelling a key cannot bypass uncertainty. Unknown legacy mock scores stay visible as history, excluded from the baseline.

## 8. Provisional Quick budget and recovery

These provisional limits are adopted for design/local testing, not claimed to be validated for a particular model. They apply only to Quick operations. The current shared client's 16,000-output-token, roughly 120-second logical-call budget must not silently apply to Quick.

| Initial package per Quick attempt | Limit |
| --- | --- |
| Coach follow-ups | At most 2, one focused question each; no need to use both |
| Checks | 1 initial check + 1 student-requested recheck |
| Retry allowance | 1 additional provider attempt shared across all initial operations; automatic retry only for malformed/incomplete output, manual technical retry uses the same allowance |
| Total provider attempts | At most 5: 2 follow-ups + 2 checks + 1 retry |
| Input | At most 4,000 tokens per full request including instruction, schema and supplied content |
| Output | Follow-up at most 512 tokens; check at most 768 |
| Per provider attempt | At most 25 seconds and no longer than remaining package/user time budget |
| Package waiting | At most 100 cumulative seconds of model wait, including failures/retries, excluding student thinking |

Maximum initial input is 20,000 tokens; maximum output is 2 × 512 + 3 × 768 = 3,328. These are ceilings, not target usage. Five calls cannot each consume 25 seconds because the 100-second package limit wins. The full task and card being checked must fit; overlong input is preserved with an editable limit message, not silently truncated and called fully checked.

**Later rechecks of the same card:** a lifetime two-check cap would break the editable-card promise. A user can explicitly request a **supplemental check package**, no earlier than 24 hours after the last package was granted to that card. It contains one check plus one shared technical retry, no follow-ups, at most two provider attempts, 8,000 input tokens, 1,536 output tokens and 50 seconds total wait, with the same per-call limits. Require changed card content since the last substantive check, or a last check that ended in technical failure. The initial package closes when a supplemental one is granted; unused allowance is not stacked. The card/attempt identity and lifetime usage ledger remain unchanged. Initial follow-ups never reset. This 24-hour recovery rule is a provisional implementation default introduced to close the lifecycle, and may be tuned with evidence.

**User-wide ceiling, also provisional:** across all Quick attempts and packages in a rolling 24-hour window: at most 15 provider attempts, 60,000 input tokens, 12,000 output tokens and 300 seconds of model wait. All four ceilings apply; creating/deleting attempts, changing request IDs or switching cards does not reset them. Package allowances are bounded by the user's remaining allowance. Show the next eligible recheck time and why a request is blocked. Manual editing, saving, free question browsing and Deep entry remain available; no background top-ups or paid calls occur because a page is opened.

Reserve call count and worst-case token/time capacity persistently before dispatch. Reconcile with known actual usage/time; keep conservative reservations for indeterminate calls and record provider usage as unknown rather than zero. Persist call start time for rolling-window accounting. Recover a crash's in-flight operation as indeterminate without silently sending it again; an explicit technical retry consumes the existing retry allowance. A provider may still bill an interrupted request, so local cancellation is not proof of zero provider usage. Log operation/config versions, duration, actual-or-unknown tokens and error category, never essay text in usage logs.

Idempotency is keyed to the logical operation and card contentVersion, not merely the caller's arbitrary request ID. Refresh/repeated clicks return an existing result or running status without new allowance. Rechecking unchanged content with an existing substantive result returns it free; a changed version uses the next permitted check. Retry reruns the failed logical operation on the same snapshot. Content failure (`needs_development`), invalid output, timeout, quota exhaustion and stale result are distinct outcomes. Exhaustion preserves the draft and provides Set aside, manual edit, Deep continuation or the next explicit supplemental opportunity; it never marks the card passed.

## 9. Migration and release boundary

The app has no plan_tasks table; `/plan` redirects to `/progress`. Retiring those is not the data migration. The actual baseline is `writing_sessions.state_json`, plus the current unversioned free-code evaluations and process-local session locks.

1. Add `schemaVersion` independent of optimistic `version`. One adapter reads old and new sessions, maps missing schemaVersion to v1, maps old activities to Deep and retains unknown fields. Persist the upgraded shape only on the next real save; do not batch-rewrite content or invent timestamps. Compatibility views expose unknown completion/evidence explicitly.
2. Establish the canonical catalog/alias map and familiarity cutoff before enabling new recommendation/checkpoint writes. Backfill minimal positive facts from mapped old attempts without altering their content; unresolved history follows section 7. Adaptation alone does not supply reliable history dates or taxonomy evidence.
3. Persist card/provenance, immutable completion facts, exposure and budget operations for correctness. These are not a speculative performance cache. Topic views may join these facts and scan existing session lists for the pilot; a separate optimized attempt-summary cache remains deferred until measured history size justifies it.
4. Keep model calls outside database transactions. Preserve the existing per-session lock across actions, edits and deletes, and transactionally guard the exact new invariants (card version, one continuation, one completion, first original and checkpoint start). The documented single persistent Node process remains the deployment constraint; do not add a second instance without a separate concurrency design.
5. First ship a reader compatible with both schemas, then enable new writes. A rollback target after Quick writes must fully support cards/budgets, or expose Quick read-only and reject its actions clearly. It must retain new tables and unknown fields, never show essay controls on Quick, and never restore a pre-release database over later user work. A read-only rollback may disable new features while preserving their recorded state.
6. Remove model-generated next-session plan wording (`lib/pipeline/engine.ts` finish path). The deterministic rule becomes the only recommendation source. Optional finish wording cannot gate completion.
7. This RFC supersedes mandatory onboarding in 原型/01, task pickup in 原型/02, planning in 原型/11, and conflicting completion/material/bank clauses in 原型/03, 10 and 90 for this feature. Mark those sections during implementation; do not treat their unrealized normalized tables as current storage. The historical docs and concepts brief are retained, not silently synchronized.

Required rollout checks include saved draft/passed/edited cards, failed and in-flight checks, deletion during requests, lost responses, old unknown-time records, alias ambiguity, read-only rollback, and round-trip preservation of unknown fields. These are requirements, not claims that runtime tests have passed in this documentation task.

## 10. Pilot measurement and acceptance

The provisional catalog capacity assumes a six-week pilot; three ordinary activities per week is a sizing assumption, not a compulsory assignment. First establish feasibility and usable telemetry. This RFC does not assert a learning-effect gain from a small descriptive pilot.

Before enrolling the cohort, freeze its dates, enrollment cutoff, catalog/budget/taxonomy versions and metric definitions. User-week denominators include every enrolled user's scheduled observation weeks, including zero-activity weeks and dropouts. Report account-deletion exclusions explicitly and remove their identifiable records rather than pretending they were active users. Use the same completion definition for any comparison; unknown-date legacy work is not a numerical baseline.

| Outcome | Reproducible definition |
| --- | --- |
| Breadth | Per user-week distinct completed question families, primary topics and types, separately; started-only work is a different metric |
| Deep guardrail | Deep completion events / enrolled observation user-weeks, including zeros; split first originals, repeats and Quick continuations (continuation is also first/repeat, not an extra completion) |
| Card use | Explicit review-open events and usefulness answers with respondent/eligible-user denominators; do not infer usefulness from card count |
| Authorship | Sample whole conversations plus cards, including passed, failed and technically interrupted cases; report coach-supplied arguments separately from honest text provenance |
| Reliability/cost | Operation and provider attempt counts, failure categories, wait distribution and known/unknown tokens; include failed, retried and abandoned work in usage numerators |
| Checkpoints | Invitations, starts, skips, qualified completions and reasons for ineligibility; baseline/eligible trend separate from other mock results |

For existing users with comparable known-time completion history, report before/after Deep rates using the same denominator and event definition. For new users or incompatible history, report description only; do not claim “Deep did not fall” without a valid comparator. Numerical learning-effect success thresholds and a causal experiment remain later decisions, distinct from the technical pilot entry criteria below.

| Case | Required result |
| --- | --- |
| Ordinary A/B completed; reserved R untouched | Rotate a Deep rewrite on A/B; never recommend R in the topic rule |
| All ordinary questions have unfinished Deep, no cards | Resume an existing Deep using stable order |
| Four passed Quick cards remain open, no Deep yet | Recommend Deep continuation; completed/open alone is not blocking work |
| Exhausted A/B; A has a set-aside unfinished rewrite | Rotate to B; if both blocked, named empty state; manual resume retains A’s attempt |
| Only set-aside work, or no ordinary questions | Named empty state and manual options; no duplicate/new work by surprise |
| Passed card edited | Same card becomes unchecked; historical credit/time unchanged; recheck checks the new version |
| Directly typed card; selected user excerpt | Honest distinct provenance; coach/other-user sources rejected |
| Quick Sunday, continued Deep Monday; repeated continuation request | Two attempts, two completion events in correct weeks, one normal continuation child |
| Required feedback saved; optional review fails or response is lost | One Deep completion; retry/refresh/finish does not duplicate or move it |
| Free-entry repeat of a question family or alias | Not a fresh original; still a valid completed activity |
| Invalid/free historical issue codes; missing recent evidence | No fabricated focus or resolved claim |
| Valid T06 in latest two fresh originals, incompatible chosen type | No T06 focus; never change question to force the focus |
| Practise reserve, delete essay, attempt checkpoint | Prior practice survives; no new unseen qualification |
| Unknown legacy mapping or external declaration unsure | No eligible baseline from uncertainty; explicit alternate/repeat route |
| Refresh/two tabs/late submission during checkpoint | One active checkpoint, no timer reset, correct late qualification |
| Budget exhaustion, crash, repeated UUIDs, delayed output | No budget reset or duplicate credit; text saved; technical state explicit |
| Later edited card after initial checks used | Explicit same-card supplemental package after cooldown and within user limit |
| Old finished record saved or regraded after upgrade | No invented completedAt or new weekly credit; historical unknown-time count remains separate |
| Delete a Quick with consumed quota or the latest fresh original | Budget remains charged; deleted-original marker retains its position and prevents substituting older focus evidence |
| Compatible rollback with Quick records | Supported lifecycle or read-only rejection; no table/content loss |

The mock catalog must pass its separate deterministic validation for IDs, quotas, allowed tags/types, provenance locators and duplicate families. Document review and fixture validation do not substitute for the above application tests. Follow-up review findings and their disposition are recorded in [the revision review](../reviews/question_bank_first_practice_revision_review_20261101.md).
