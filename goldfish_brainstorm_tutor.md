# Goldfish Brainstorm Report: Tutor Response Style and Model Tiers

**Target:** `/Users/chen/Desktop/opc/concepts_brief_tutor.md` (whole document, version 2, 2026-11-03)
**Mode:** BRAINSTORM
**Date:** 2026-11-03

## Reviewer Status

| Reviewer | Lens used | Status |
| --- | --- | --- |
| `egm-design` | Architecture, cost, quota, latency, failure modes | completed |
| `egm-codebase-details` | Codebase grounding, reuse, telemetry | completed |
| `egm-zoom-out` | Contrarian / YAGNI | completed |
| `egm-comprehension` | UX and ergonomics, naive reader | completed |
| `egm-implementation-readiness` | Migration, compatibility, rollout | completed |
| `egm-structural` | Document structure, maintainability | completed |

Severity counts after deduplication: **4 Blocker, 19 Major, 12 Nit.**

Paths below are relative to `/Users/chen/Desktop/opc`. I re-checked the evidence for the Blockers myself (engine.ts call sites, client.ts:44, calls.ts:42-43, :52, :93-94).

## Summary

The brief depends on plumbing that does not exist yet. Deep-practice (精练) calls have no purpose and are not logged. The purpose list does not match the real call sites. The Quick reservation code rejects any per-tier model, output cap or timeout. No tier reproduces today's behavior. Until these four are fixed, neither Stage A nor Stage B can produce the data the brief says it will collect.

On scope, the reviewers mostly agree on four points:
- Keep Quick out of tiers.
- Make Mentor the default tier.
- Keep tiers internal-only until real, different models exist (B′).
- Leave the Adept fallback out of Stage B.

Two lenses also question whether Comprehensive can work at all under the proposed priority order.

---

## Blockers

### B1. Deep-practice calls have no purpose and are not logged

- **Lens:** all six (codebase-details, design, zoom-out, implementation-readiness, structural, comprehension)
- **Affected section:** F5 (从第一性原理出发); 1.4; 1.5; 2.2; 三、代码改动范围; 四、上线顺序
- **Problem:** None of the eight `generateJson` calls in `lib/pipeline/engine.ts` (lines 64, 79, 105, 113, 131, 146, 161, 182) passes `options`. `client.ts:44` writes an `llm_calls` row only when `options.userId` is set. So today only Quick calls (`quick_followup`, `quick_check`) are recorded, and scoring is not recorded either. This has three effects:
  - `resolveModel(purpose, tier)` has nothing to key on for Deep calls.
  - "每次调用记录风格和档位" cannot hold.
  - Stage A's rewrite-rate question and Stage B's per-tier latency and token figures cannot be measured for Deep practice.

  `成本备忘录.md` §6 already assumes this logging exists. It does not. `runAction` (engine.ts:25) takes no userId, and its callers (`app/api/sessions/[id]/actions/route.ts:54`, `lib/pipeline/retry-review.ts:38`) do not pass one. Adding options also changes how timeouts are classified, because of the `!options` branch at client.ts:77.
- **Recommendation:** Add a **Stage 0** before Stage A. Pass `purpose`, `userId`, `sessionId` and an operation/request id from every engine call into the existing `observeCall` path. Add `engine.ts`, `route.ts` and `retry-review.ts` to the code-change table, and test the change in timeout handling. Stage 0 also gives the cost memo its weekly roll-up.

### B2. The conversation/judging split does not match the real call sites

- **Lens:** codebase-details, structural, zoom-out, implementation-readiness, comprehension
- **Affected section:** 1.4 只作用于对话类调用; 三
- **Problem:** The table classifies the 13 labels in `budget.ts:15`, not the actual calls:
  - `opening` is not a model call. It is a fixed string (`lib/pipeline/initial.ts:25`, `lib/learning/prewrite-guidance.ts`), so style and tier cannot affect it.
  - `diagnosis` has no call of its own. Scoring and diagnosis come back from one call (engine.ts:64).
  - `idea_extract` has no dedicated caller. Outline extraction happens inside the `prewrite_turn` call (engine.ts:113-118), so changing the style or tier also changes what goes into the student's outline.
  - The `finish` memory summary (engine.ts:105) and the optional review are in neither column.
  - The writing-assist `check` action (engine.ts:157) is a grammar judgment, yet it would get style and tier. For example, Concise could drop real errors.
  - Keeping two parallel arrays means the next new purpose can be left unclassified without anyone noticing.
- **Recommendation:** Replace the table with a map from each real call site to an action, a purpose and a group. Encode it as `Record<LlmPurpose, { class: "conversation" | "judge", ... }>` so the compiler forces every purpose to be classified. Make `judge` the safe default. Put `check`, `finish` and review in the fixed group. Remove `opening` from the list. Decide what happens to the mixed prewrite extraction. Add a test that every `generateJson` call site passes a classified purpose.

### B3. Tiering Quick follow-ups breaks the reservation and budget code

- **Lens:** design, codebase-details, implementation-readiness, structural, zoom-out
- **Affected section:** 2.3 (the 注意 paragraph and points 1-2); 1.3; 三; Key Decisions 未解决 (速刷里是否提供 Sage)
- **Problem:** The Quick path is built on fixed, thinking-off numbers, and it rejects calls that do not match them:
  - **Model:** `reserveCall` records the model from `process.env.LLM_MODEL` (calls.ts:52). `consumeReservation` throws if it differs from the model actually used (calls.ts:93, client.ts:39). Any tier on another model would fail every Quick call.
  - **Output caps:** `reserveCall` throws a RangeError above 512 or 768 tokens (calls.ts:42-43). The same caps are hard-coded in quick-model.ts:50.
  - **Package and user budgets:** the package output budget of 3,328 is exactly 2×512 + 3×768 (budget.ts:10). The user daily window is 12,000 (budget.ts:13). A Sage cap of a few thousand tokens can never be admitted.
  - **Timeouts:** reserved time is clamped to 25 s for every tier (`lib/rules/llm-budget.ts:32`). Timed-out calls are charged their full reserved time (llm-budget.ts:18).
  - **Input estimate:** the input size is estimated from messages built without any style text (quick-model.ts:49). If the style segment is added only at send time, every Quick call fails with `input_too_long` (calls.ts:94).
  - **Behavior change:** even Adept (`low`) turns thinking on, while Quick today runs with thinking off (config.ts:25-29). Every Quick user would get slower replies.
  - **Little benefit:** the brief itself says reasoning-effort differences are probably invisible in an 80-character question (2.3 point 3).
- **Recommendation:** Keep `quick_followup` out of tiers in this project and leave it on today's thinking-off setting. That also closes the open question about Sage in Quick. Resolve style (and later tier) once, before the reservation. Build the message list once, style segment included, and use that same list for both the estimate and the send. If Quick is tiered later, derive package and user limits from the tier table and record the tier's model on the reservation.

### B4. No default tier, and nothing reproduces today's behavior

- **Lens:** implementation-readiness, design, structural, comprehension, codebase-details, zoom-out
- **Affected section:** 1.2 (Standard as 对照组); 1.5; 2.3; 2.4; 三 (features.ts row); Analysis risk 4
- **Problem:** Today's two paths run differently:
  - Deep calls send no reasoning settings, so they get DeepSeek's default: thinking on, effort high, with the client defaults of 16,000 tokens and 120 s (client.ts:40-41, :55). That is Mentor.
  - Quick turns thinking off, which no tier reproduces.

  The brief never names a default tier. It never says what existing users, sessions started before the release, or `TIERS_ENABLED=false` get. The fallback goes to Adept, which would quietly lower Deep coaching from high to low effort. Analysis risk 4 ("现在的上限和超时是按不思考或低思考量定的") is true only for Quick.
- **Recommendation:**
  - Make Mentor the default and the baseline for missing or unknown values. Standard + Mentor then reproduces today's Deep behavior and is the real reference point.
  - Require `TIERS_ENABLED=false` to produce request bodies byte-identical to today's, including Quick's thinking-off. Keep tests/llm-calls.test.ts:226-243 as the regression check.
  - Check whether sending `reasoning_effort: high` explicitly behaves the same as leaving it out.
  - Limit Analysis risk 4 to Quick.
  - Treat Adept as a downgrade that needs its own coach-behavior test cases.

---

## Major

### M1. The style segment's priority wording does not protect the teaching rules, and makes Comprehensive inert

- **Lens:** codebase-details, comprehension, design, zoom-out
- **Affected section:** 1.2; 1.3 风格放在规则下面
- **Problem:** The sketch in 1.3 misdescribes the prompt in three ways:
  - **Where the prohibitions live:** the real fixed rules (messages.ts:7) do not contain "不得提供论点或范文". Those prohibitions sit in per-call instructions (engine.ts:114, :159; quick-model.ts:26). The style segment only forbids changing "上面的规则" and "下面的字数和格式要求". Read literally, it may override the per-call teaching prohibitions, which breaks F1.
  - **Message structure:** the system message has four parts, not two: fixed rules, JSON Schema, call instruction, and an optional retry hint.
  - **Existing "concise" wording:** the fixed rules already say "Explain in concise Chinese by default", and the instructions say "Keep reply concise" (engine.ts:114), "briefly" (:159) and "short" (:131). A lower-priority Comprehensive segment loses to "concise" from both above and below. Concise is mostly what Standard already is. Students who pick Comprehensive and see no change will think it is broken.
- **Recommendation:** Move the teaching prohibitions (no arguments, no model essays, no templates) into the fixed rules. Move the verbosity wording out of the fixed rules and instructions into the style slot, with Standard's text holding today's wording. Separate hard limits (schema max length, "ONE question"), which style must not touch, from soft wording, which style may adjust. Add one sample reply per style for at least `prewrite_turn` and `writing_chat`.

### M2. The "per-call length limit" mostly does not exist, and two kinds of limit are confused

- **Lens:** codebase-details, design, structural
- **Affected section:** 1.2 (不能超过各调用原有的字数上限); 1.3; 2.3; Goals
- **Problem:**
  - **Few real limits:** Deep `reply` fields allow up to 12,000 characters (schemas.ts:35-36). Real limits exist only for Quick follow-ups (80 characters), nudges (500, engine.ts:131) and Quick check notes (60). So the promise that Comprehensive will not exceed the limit binds nothing in Deep practice, and Comprehensive's cost has no upper bound.
  - **Two meanings of "limit":** 1.2 and 1.3 mean prompt-level character limits. 2.3 and 三 mean per-tier `max_tokens`, which includes reasoning. A reader can conclude that tiers break the style invariant.
- **Recommendation:** Set explicit reply-length limits per conversation purpose in the schema or the purpose table. Name the two limits separately: "prompt length limit (fixed per purpose)" and "per-tier token budget (includes reasoning)".

### M3. Style collides with the hint ladder and with actions that produce copyable text

- **Lens:** comprehension, structural
- **Affected section:** 1.2; 1.4
- **Problem:**
  - **Hint ladder:** `issue_hint` already controls detail by level (engine.ts:146). Level 1 asks a question, level 2 explains a reasoning route, and level 3 may give one example sentence. Comprehensive is defined as "解释推理路线", which is level 2, so Comprehensive at level 1 skips the ladder. Comprehensive's "不能提供例子" also contradicts level 3.
  - **Copyable text:** polish and express return sentences the student can copy (engine.ts:158), so a "more detail" style pushes toward ghostwriting.
- **Recommendation:** State that style changes wording within a level and never moves the level, and that the task instruction wins any conflict. Decide per action whether style applies; consider excluding polish, check and express. Add behavior test cases for these conflicts.

### M4. No user problem is stated; the smallest test is smaller than three styles

- **Lens:** zoom-out, structural
- **Affected section:** Overview; F5; 1.1; Analysis risk 1
- **Problem:** The only stated motivation ("young users want variety") is called a guess in F5. Section 1.1 and Analysis risk 1 then say this version no longer addresses it. Tiers have no stated motivation at all once pricing is out of scope. The business memo puts the product at stage 0 with 3-5 internal testers. That is too few to show whether style changes the rewrite rate.
- **Recommendation:** Add a Problem/Objectives section at the top with a testable claim, for example "testers find coach replies too long or too short". Check that claim cheaply first, using the existing session `rating` and `comment` (lib/pipeline/types.ts) and tester interviews. If it holds, start with one alternative to Standard (a two-option toggle) or simply change the default prompt. Add Comprehensive only once there is evidence students want more explanation. Decide now whether "variety" is dropped and whether the feature is renamed to "回复详略".

### M5. A tier picker that students can see in Stage B tests nothing

- **Lens:** zoom-out (rated Blocker), comprehension (rated Major)
- **Affected section:** 二、模型档位; 2.3; 四 stage B; Goals
- **Problem:**
  - **No trade-off:** with no price, the only cost of Sage is waiting. Students will keep the default or pick Sage, which says nothing about whether three tiers are worth having.
  - **Nothing to see:** the brief says Stage B validates only the pipeline, and that differences will probably not be visible. Students would face a choice that visibly does nothing.
  - **Misleading labels:** Sage and Adept are the same model.
  - **Promised results:** the Sage blurb "适合冲分阶段的难题" implies better scores.
- **Recommendation:** Keep the lookup table but make tier selection internal in Stage B (an env setting or admin override). Stage B's own questions (reliability, latency and tokens per tier) can be answered with an internal switch or a script. Ship the student-facing picker at B′, with distinct models and, ideally, pricing. Kept at Major because the owner already chose this rollout. Zoom-out considers it blocking.

### M6. The Adept fallback is underspecified and does not protect against anything in Stage B

- **Lens:** all six
- **Affected section:** 2.4 中途换档与故障; 2.3 point 2
- **Problem:**
  - **Same endpoint:** in Stage B all tiers share one provider, model and key. A `provider_error` on Sage will hit Adept too, and retrying adds load during an outage. Account and billing errors (json.ts:18-22) hit every tier.
  - **Wrong trigger:** the likeliest Sage failure, running out of tokens while thinking, is classified as `invalid_output` (client.ts:69), not `provider_error` or `timeout`. So the fallback would never fire for it.
  - **No outcome on the error:** `ModelError` carries only a message and status (json.ts:2-3). The outcome class exists only in the database row, and Deep calls have no row (B1).
  - **Quick quota:** a Quick reservation allows exactly one attempt (client.ts:34). A fallback needs a new reservation, which uses up the package's single retry and may be refused for quota.
  - **Time:** Sage timeout, then Adept, then the internal retry window of 70 s (client.ts:78) must fit inside the 300 s route limit (route.ts:21) and nginx's 360 s. Revision evaluation already makes two judge calls in a row (engine.ts:64, :79).
  - **Undefined cases:** what happens when Adept itself fails; whether the student's setting changes; how a fallback is recorded.
  - **The message:** "这一档" does not name the tier, and the message drops the existing reassurance "你的文字已经保留".
- **Recommendation:** Leave the fallback out of Stage B and use the existing error and retry path. When the fallback is built at B′, specify it as a state table:
  - Triggers include truncation.
  - At most one fallback, and never for judging calls.
  - Fall back only when the target uses a different provider.
  - One shared time limit per turn that fits inside the route limit.
  - Quick quota behavior.
  - Behavior when the fallback also fails.

  Record `requested_tier` and `served_tier`, and put the outcome class on the error object. Example copy: "Sage 这次没来得及回答（超时），这一条已由 Adept 回答。你的设置仍是 Sage。你的文字已保留。"

### M7. Mid-practice switching collides with the session lock, retries and idempotency

- **Lens:** implementation-readiness, codebase-details, design, structural
- **Affected section:** 1.5 选择与切换; 2.4
- **Problem:**
  - **No session field:** `SessionState` has no style or tier field (lib/pipeline/types.ts:6-27).
  - **Lock:** while a model call holds the session lock (up to 300 s), any other write on that session gets a 409 (lib/pipeline/lock.ts).
  - **Overwrite:** the action route saves the state it read *before* the model call (route.ts:43-57), so a switch written outside the lock is overwritten.
  - **Quick retries:** retries replay the frozen inputs (quick-model.ts:24, :77-84). Those inputs store no style or tier, and their `configVersion` is saved but never checked.
  - **Receipts:** Quick receipts hash the request body (quick-model.ts:62-65). With style or tier in the body, a retry after a switch raises a 409. With them read from the session, the retry silently changes tier.
  - **Rollback:** the draft PATCH schema is strict, so adding fields there would make open tabs fail with 400 after a rollback.
- **Recommendation:** Send style and tier with each action request, validated as an enum. Resolve tier to model, parameters and caps once, when the operation is created. Freeze them in `pendingAction.input`, the Quick frozen input and the reservation. Technical retries replay the frozen values, so "只影响之后的回复" means new operations only. Say whether style and tier are part of the receipt hash. Sessions created before the release take the user's default on their next call.

### M8. Where settings live and where pickers appear is undefined

- **Lens:** implementation-readiness, codebase-details, zoom-out, comprehension, design
- **Affected section:** 1.5; 三 (schema.ts row "用户设置里加默认风格和默认档位"; 前端 row)
- **Problem:**
  - **No settings table:** the existing home for preferences is `users.profile_json`, merged over `DEFAULT_PROFILE`, next to `lang` (schema.ts:25, lib/auth/types.ts, lib/db/queries/users.ts:15-22). It needs no migration and survives rollback. `profilePatchSchema` is `.strict()` (validation.ts:11).
  - **Too many layers:** an account default, a per-practice choice and mid-practice switching are three layers, with no evidence that any of them is needed.
  - **No defined start page:** "练习开始页" is not defined across the three modes (精练, 速刷, 模考; the mock exam has no coach during writing, engine.ts:137). Quick receives no profile (route.ts:33) and its schemas are strict.
  - **Unclear scope of a switch:** it is not said whether a mid-practice switch also changes the default.
- **Recommendation:** Store `tutorStyle` and `tutorTier` in `profile_json`, with enum validation and defaults standard/mentor. Treat unknown stored values (for example a retired tier) as the default, without deleting them. Start with the account default only, and add per-practice and mid-practice switching when testers ask for it. Specify picker visibility per mode. If mid-practice switching ships, it applies to this practice only and offers an explicit "设为默认". Reuse the topbar dropdown pattern (essay-topbar.tsx:120).

### M9. The `llm_calls` migration is not specified

- **Lens:** implementation-readiness, codebase-details
- **Affected section:** 三 (schema.ts row)
- **Problem:** The brief does not say:
  - whether the new columns are nullable, or what their defaults are;
  - what judging calls store in them;
  - how existing rows read (they are all Quick and pre-feature, so they must read as unknown, not as `standard`).

  Migrations only go forward, so a rollback runs old code on the new schema. That works only if the columns are nullable or have defaults, because the INSERT at calls.ts:32-33 names its columns explicitly. A table-level `check()` makes drizzle-kit rebuild the whole table, which must not happen while rows are `reserved`. A new column also touches migration 0007, the INSERT, `CallRecord`, the metadata zod schema (calls.ts:25) and the field check in `consumeReservation` (calls.ts:93).
- **Recommendation:** Add nullable `tier` and `style_id` with no default, where NULL means pre-feature. Pick one convention for judging calls (for example `tier='judge'` and style NULL). Record the effective values after any fallback or with the flag off. Do not add a CHECK that forces a rebuild, or run the migration with the app stopped after `db:backup`. Add a migration test on a populated database in the `scripts/test-db.ts` style.

### M10. Stage B cannot size per-tier caps, and Stage A cannot link replies to calls

- **Lens:** design, codebase-details, implementation-readiness
- **Affected section:** F3; 2.3 point 1; 1.5; 四 stage A and B; Key Decisions 未解决 (每档的输出上限和超时)
- **Problem:**
  - **Token counts:** `readUsage` keeps only prompt and completion tokens (client.ts:19-20), so reasoning tokens are not separated.
  - **Truncation:** `finish_reason` is not stored, so a call cut off by `max_tokens` looks the same as bad JSON (both are `invalid_output`, client.ts:69).
  - **Request settings:** the provider and the extra parameters sent are not stored.
  - **F3 is unconfirmed:** the provider-doc summary does not confirm that reasoning counts against `max_tokens`. Only the comment at config.ts:3-4 says so.
  - **No link from reply to call:** `CoachMessage` has no style, tier or call-id field (lib/prototype/types.ts:51-66), so a reply cannot be tied to its ledger row.
  - **Undefined metric:** "改写率" could mean `completion_events.relation='rewrite'` (schema.ts:113) or the suggestion-accept rate (engine.ts:18, :36).
- **Recommendation:** Add a `truncated` outcome (finish_reason = length) and columns for `finish_reason`, `reasoning_tokens` (nullable, if the provider returns it), `requested_tier`, `served_tier`, a provider label and a hash of the parameters sent. Mark F3 as a hypothesis that Stage B tests. Fix the sizing rule in advance, for example cap = p99 of completion tokens × 1.3, from at least N calls per tier and purpose. Store the call id on each CoachMessage, and define rewrite rate with a formula and a data source.

### M11. The judge is not pinned or versioned separately, so F2 cannot be checked

- **Lens:** design, implementation-readiness, structural, codebase-details
- **Affected section:** F2; 2.2; 2.3 (judge: 现有评分配置不变); 三 (budget.ts row)
- **Problem:**
  - **Two judge configs:** Deep scoring, comparison and review run on DeepSeek's defaults (thinking on, high, 16k). `quick_check` runs with thinking off and a 768 cap. A single `judge` row would either turn thinking on for `quick_check` or turn it off for scoring.
  - **Provider default decides:** "unchanged" means the provider's default sets the effort. If DeepSeek changes that default, scores drift silently.
  - **One global version:** `callConfigVersion` (budget.ts:7) is one constant stamped on every row, judge rows included. Folding the tier table into it would change scoring rows' version every time Sage's model changes, so the ledger could no longer show that the judge stayed the same.
  - **Unstamped scores:** stored evaluations carry no model or version (lib/pipeline/types.ts).
  - **No change policy:** "评分模型最终选哪个" is open, and nothing says how existing users' score history is handled when the judge changes.
- **Recommendation:** Give each judging purpose its own pinned row (model, thinking on/off, reasoning_effort, max_tokens, timeout). Version the judge separately from the conversation tier table and the style text, and store those versions per call. Stamp the judge version onto stored evaluations. Write a judge-change policy: re-baseline, mark the break on the progress chart, or re-score. Reword F2 as "same judge configuration and version", since a fixed model gives comparable scores, not identical ones.

### M12. The tier table must keep provider gating and environment validation

- **Lens:** implementation-readiness, codebase-details, design, structural
- **Affected section:** 2.2; 2.3; 三 (config.ts, client.ts rows)
- **Problem:**
  - **Provider gating:** today the thinking-off option is sent only to `api.deepseek.com` with a `deepseek-*` model (config.ts:25-29), and tests check this (tests/llm-calls.test.ts:226-248). Sending a tier's `reasoning_effort` to staging or other compatible endpoints without the same check could cause 400s.
  - **Unverified support:** the provider docs do not confirm that deepseek-flash accepts `reasoning_effort`.
  - **Missing keys:** a per-tier `baseUrl` and key means up to four credential sets. Today a missing key fails the whole service (client.ts:25).
  - **Single env pair:** `getLlmConfig` is also used as a pre-check (quick-model.ts:115) and in `scripts/llm-ping.ts` and `scripts/verify-quick-model.ts`, and is documented in `.env.example` and the README.
- **Recommendation:**
  - Have the judge entry read the existing `LLM_*` variables, so the production `.env` does not change.
  - Apply host/model gating to every tier's extra parameters.
  - Validate each tier at startup. A missing Sage key disables only Sage.
  - Optionally restrict providers to an allow-list of domestic, registered (备案) ones.
  - Remove the hostname logic from `quickProviderOptions` rather than "merging" it, so there is one source of provider parameters.
  - Stage B entry gate: one live call per tier that returns 200 with finish_reason "stop". Update scripts and docs.

### M13. Capacity and cost guardrails are missing once tiers are free

- **Lens:** design
- **Affected section:** 2.3 point 2; 2.4; Goals/Non-Goals (pricing out of scope); 四 stage B
- **Problem:**
  - **Concurrency:** admission allows 8 model workflows at once globally and 1 per user (admission.ts:11, :21-22). A workflow holds its slot for the whole action, so if Sage takes about 5× as long, capacity drops about 5× and users see 429 "模型服务当前繁忙".
  - **Nudges block the user:** nudges fire automatically and are in the tiered set. A slow Sage nudge holds the user's only slot, so their explicit chat request is refused.
  - **No Deep token budget:** the only Deep limits are 30 calls per minute, 200 messages and 40 prewrite turns. Each call can produce up to 16k output tokens and is tried twice.
  - **Cost concentrates in the tiered calls:** conversation calls are about 16k of 29k output tokens per practice (成本备忘录.md §3), and reasoning is billed as output. A free Sage pushes cost toward this missing ceiling. The ¥0.50-per-practice target (§5) is not mentioned.
- **Recommendation:** Leaving pricing out does not mean leaving cost limits out. Bring into scope:
  - a `max_tokens` per tier and per purpose;
  - a daily Deep output-token limit per user;
  - a switch to turn off each tier on its own (for example Sage off);
  - a cap on concurrent Sage calls, or counting a Sage call as more than one slot;
  - a fixed fast setting for nudges.

  Make p95 latency and cost per practice for each tier pass/fail exams in Stage B.

### M14. Stage gates have no exit criteria, and key terms are undefined

- **Lens:** zoom-out, structural, comprehension, implementation-readiness
- **Affected section:** 四、上线顺序; F5; Analysis
- **Problem:**
  - **No decision rules:** Stage A asks "学生会不会换风格？改写率有没有差别？" and B′ asks "到底上几档？", with no thresholds, sample sizes or decision rules.
  - **Undefined terms:** 改写率, 教练行为用例 (which cases, how many runs, who grades them), 盲测 (who tests, and how), 评分评测, 管线, judge.
  - **No real control:** "对照组" is misleading because users choose Standard themselves.
  - **Unclear F5:** F5 says data will validate variety, which 1.1 says is no longer addressed.
  - **No cost or timeline:** there is no cost estimate for the evals or for `max` reasoning.
  - **Existing tests:** tests that pin values this work changes on purpose are not listed (tests/llm-budget.test.ts:13, tests/llm-calls.test.ts:226-243, tests/quick-model.test.ts:18).
- **Recommendation:** Add a short glossary. Give each stage an exit criterion and a fail action. Examples:
  - Stage A: Standard's system message is byte-identical to today's (unit test on `buildMessages`); adversarial "Comprehensive must not supply arguments" cases, each run several times, with 0 violations; length and format limits kept.
  - Stage B: per-tier targets for ok rate, truncation and timeout rate, and p95 latency; a flag-off parity test.
  - Fail action: remove the feature.

  With 3-5 testers, treat rewrite rate as descriptive only. Add a rough token and cost estimate per tier from the cost memo table, and list the existing tests that are expected to change.

### M15. English-only names in a Chinese UI; style and tier will be confused

- **Lens:** comprehension
- **Affected section:** 1.1 (second bullet); 2.1 命名 and the student one-liners; 三 前端
- **Problem:**
  - **Existing UI language:** the UI is `lang="zh-CN"` and its options are labeled in plain Chinese (onboarding-form.tsx:140, essay-topbar.tsx:120).
  - **Unclear names:** "Adept" is uncommon for a band 5.5-6.5 student and means "expert", which can sound higher than Mentor. So "一眼能看出高低" fails for this audience. "Sage" can read as 鼠尾草. The Odyssey story behind Mentor is internal reasoning that students never see.
  - **Weak fix for confusion:** the brief admits students will confuse style and tier, but its only fix is one sentence of copy.
  - **"More is better":** the blurbs make "Comprehensive + Sage" look like the best choice.
  - **Silent waits:** Sage turns can wait silently for up to 120 s.
- **Recommendation:**
  - Pair each English name with a Chinese gloss and a visual order cue: Adept · 快速, Mentor · 均衡, Sage · 深度; Concise · 简短, Standard · 标准, Comprehensive · 详细. State that the owner's "English names" decision allows glosses.
  - Describe tiers as a speed vs. depth trade-off, never as better results ("冲分").
  - Make the two controls look different and use different words: style = 回复长短, tier = 思考深度/等待时间.
  - Show the expected wait per tier, filled from Stage B data, and a "思考中" progress state.
  - Ask about 5 target students to put the three tier names in order with no hints before the names ship.

### M16. The 3×3 eval matrix will go stale

- **Lens:** structural, codebase-details, design
- **Affected section:** 1.1; Analysis risk 5; 四
- **Problem:** The real eval size is 9 combinations × about 6 live conversation purposes × N cases, re-run on every model change. Nothing ties an eval result to a table or style version, so an old pass will look current. The brief does not mention the existing tooling.
- **Recommendation:** Split evals into three layers:
  - Style-invariant checks per purpose, run on every tier only in the riskiest cell (Comprehensive × top tier).
  - Tier quality compared on Standard only.
  - The full matrix only before B′.

  Key each result to the table and style versions, so a release checklist flags results whose version no longer matches. Reuse `scripts/verify-quick-behavior.ts` and `scripts/verify-quick-model.ts`, and start from the per-purpose effort levels in `原型/90_共享规范.md` §6.3. Deep practice has no live-model behavior test today (tests/learning-flow.test.ts uses canned outputs). Keeping Quick and nudges off tiers (B3, M13) also shrinks the matrix.

### M17. Feature-flag semantics and the rollback steps are undefined

- **Lens:** implementation-readiness, codebase-details
- **Affected section:** 三 (features.ts row); 四
- **Problem:** The brief does not say:
  - what turning a flag off does to stored preferences, the UI, and the values recorded in `llm_calls`;
  - whether TIERS depends on STYLES;
  - what sessions in progress see when a flag flips;
  - the order of rollback steps.

  Flags are environment-wide only and server-only (features.ts:4-12), so there is no cohort rollout.
- **Recommendation:** With a flag off: hide the pickers, keep stored preferences, use standard/mentor as the effective values, and record those effective values. A flip takes effect on the next call. Rollback order: flag off, then code rollback; the schema stays. Old browser tabs that send no style or tier get the server default.

### M18. Analysis, decisions and open questions are scattered and incomplete

- **Lens:** structural
- **Affected section:** Analysis; Key Decisions & Staging for Next Steps
- **Problem:** Analysis is labeled "（待 Goldfish 评审后填写。）" but lists five risks. Four of them repeat 1.1 and 2.3, and none has a mitigation, owner or trigger. Several real risks are missing:
  - fallback behavior;
  - coupling between tiers and the Quick budget;
  - legal disclosure of the model and its filing (备案);
  - the cost of `max` reasoning;
  - trademarks.

  Only three items are listed as unresolved, while at least five more are buried in the body:
  - the rename to 回复详略 (1.1);
  - the trademark check (2.1);
  - the legal disclosure question (2.2);
  - who sets and approves the per-tier caps (2.3);
  - whether the purpose split is approved for tiers (decision 4 covers styles only).

  The fallback policy and the default tier appear nowhere among the decisions.
- **Recommendation:** Rename Analysis to "Risks & Mitigations" and use one table with the columns risk, impact, mitigation, and stage where it is checked. Map every "要/需要/是否" sentence in the body to exactly one entry under decided, recommended or open. Add a "decisions that block each stage" list (Stage 0, A, B, B′).

### M19. Alternatives Weighed covers naming, not design

- **Lens:** structural
- **Affected section:** Alternatives Weighed
- **Problem:** Most rows are about naming or pricing. None compares the core design choices:
  - a tier→model table vs. a purpose×tier→model table (成本备忘录.md §5 already suggests choosing models per call type, which a tier-only table cannot express);
  - one shared style segment vs. separate instructions per style;
  - falling back to Adept vs. failing with a retry;
  - storing the tier per session vs. per operation.
- **Recommendation:** Add these rows. A purpose×tier table also supports keeping nudges and Quick on fixed settings.

---

## Nit

### N1. "每次调用都会完整传入对话历史" is wrong
- **Lens:** design, codebase-details, implementation-readiness
- **Affected section:** 2.4
- **Problem:** History is cut per call: prewrite keeps the last 20 messages (engine.ts:115), writing the last 14 (:161), issue hints the last 8 (:146), and nudges get none (:131). Only Quick passes everything.
- **Recommendation:** Correct the sentence. Switching tiers mid-practice is still safe, because nothing is lost from storage.

### N2. Place the style text after the JSON Schema
- **Lens:** design, codebase-details
- **Affected section:** 1.3
- **Problem:** The brief does not say where the style text goes relative to the JSON Schema. Putting it before the Schema changes the shared prompt start for every style.
- **Recommendation:** Put it after the fixed rules and the Schema, so each purpose's prompt start stays the same across styles. That helps provider prefix caching, if DeepSeek does it; the provider docs do not confirm this. Cache hit rate is a cost driver in 成本备忘录.md §5.

### N3. Section order and heading language
- **Lens:** structural
- **Affected section:** whole document; 1.1
- **Problem:** Goals and Non-Goals come after the design and the risks, so the reader learns the scope last. Headings mix numbered Chinese and English template titles. 1.1 is a changelog against a 上一版 the reader cannot see.
- **Recommendation:** Reorder to Problem, Goals/Non-Goals, First Principles, Design, Code scope, Rollout, Alternatives, Risks, Decisions/Open. Use one heading language. Move the version diff into the Status line.

### N4. Risk 5 contradicts 1.1
- **Lens:** structural
- **Affected section:** Analysis risk 5; 1.1
- **Problem:** Risk 5 says the evals "翻倍" (double), while 1.1 says 9 combinations is fewer than 12.
- **Recommendation:** State the baseline: 1 configuration today becomes 9.

### N5. "结论" is used two ways
- **Lens:** comprehension
- **Affected section:** 1.2
- **Problem:** In the Concise row, "结论" means the coach's judgment. In the Comprehensive row, it means essay content.
- **Recommendation:** Use 判断 for the coach's verdict and 观点结论 for essay content.

### N6. "80 字" means 80 characters
- **Lens:** comprehension
- **Affected section:** 1.4; 2.3
- **Problem:** The code limit is `max(80)` characters (quick-model.ts:20). For `lang=en` learners that is about 13 English words, while a reader will assume 80 Chinese characters.
- **Recommendation:** Say "80 characters" and note how style behaves for English-language learners.

### N7. Trademark reasoning is inconsistent, and the check is early
- **Lens:** comprehension, zoom-out
- **Affected section:** 2.1; Alternatives Weighed
- **Problem:** The Alternatives table rejects the four-tier set partly because Adept clashes with Adept AI, yet the chosen set keeps Adept. The trademark note in 2.1 mentions only Sage.
- **Recommendation:** Add Adept to the trademark check, or explain why the clash is acceptable now. Since tiers ship only at B′, the check can wait until then.

### N8. The tier details page is undefined
- **Lens:** comprehension, codebase-details, zoom-out
- **Affected section:** 2.2
- **Problem:** The "档位详情页" is never defined. In Stage B it would show deepseek-flash for all three tiers. When models are swapped later, Sage users silently get a different model, and no notice is described.
- **Recommendation:** In Stage B, say plainly "三档目前是同一模型的不同思考深度". Define what students are told when the table changes. Link the legal disclosure question to 商业计划备忘录.md §9; the prototype is internal-only and compliance is unresolved.

### N9. Recording "per reply" vs. "per call" is inconsistent
- **Lens:** comprehension
- **Affected section:** 1.5; 2.2
- **Problem:** 1.5 says each coach reply records `style_id`, while 2.2 and 三 say each call in `llm_calls` does. One reply can take several calls. After a switch, a student rereading the thread cannot tell which style wrote which reply.
- **Recommendation:** Record on both the call and the message (see M10), and show a small divider in the thread ("已切换为 Concise · 简短").

### N10. Feature flags are environment-wide
- **Lens:** codebase-details
- **Affected section:** 三 (features.ts row)
- **Problem:** `tests/features.test.ts:6-8` compares the whole flag object, so it breaks when flags are added. `readFeatures` is server-only, so the UI cannot read flags directly.
- **Recommendation:** Update the test, and pass the flags to the UI from the server.

### N11. Logging Deep calls adds SQLite writes
- **Lens:** design
- **Affected section:** 四 stage A
- **Problem:** Stage 0 adds one insert and one update per Deep call on SQLite's single synchronous writer (calls.ts:31-34, :75-81). That is fine at current scale, and the table is indexed (schema.ts:14-15).
- **Recommendation:** Count it in the Stage A load estimate.

### N12. Mentor already equals today's Deep behavior
- **Lens:** zoom-out, design
- **Affected section:** 2.3; 2.2
- **Problem:** A fixed judge model is already true today: every call uses the same config, with DeepSeek's default thinking. Mentor (`high`) matches today's Deep coach and judge settings, and the brief does not say so.
- **Recommendation:** Say this in 2.3. It supports making Mentor the default (B4), and keeps Adept from becoming a silent downgrade.

---

## Suggested minimal path (consensus across lenses)

1. **Stage 0:** label and log every engine call (B1), and replace the purpose list with a call-site map whose default is the judge group (B2).
2. **Stage A:** collect evidence about reply length from testers. If it is confirmed, ship one or two prompt-only styles, with the teaching prohibitions in the fixed rules and the verbosity wording in the style slot (M1). Store the default in `profile_json` (M8), apply styles to Deep coach calls only, and leave Quick unchanged.
3. **Stage B:** an internal lookup table with a pinned, separately versioned judge (M11) and Mentor as the default and baseline (B4). No student-facing tiers (M5), no Quick tiering (B3), no fallback (M6). Gate it on truncation rate, p95 latency and cost per tier (M10, M13, M14).
4. **Stage B′:** student-facing tiers with distinct domestic models, Chinese glosses (M15), a specified fallback and, ideally, pricing.
