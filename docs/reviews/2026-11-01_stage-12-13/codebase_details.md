Read: persona=yes, standard=none, targets=yes

Files read (supporting files include relevant excerpts):

- Persona: `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/agents/codebase_details.md`. It names no standard.
- `AGENTS.md`; `原型/{12_题库与推荐,13_速刷与主题卡片,90_共享规范,00_总览,91_前端布局,99_实现清单,10_记忆整理}.md`.
- `docs/designs/question_bank_first_practice.md`; `data/question-bank/README.md`.
- `lib/pipeline/{types,initial,schemas,engine,client-state,lock}.ts`; `lib/prototype/types.ts`; `lib/prototype/session-store.tsx`; `lib/learning/summary.ts`; `lib/db/schema.ts`; `lib/db/queries/sessions.ts`; `lib/llm/{client,config}.ts`.
- `app/api/sessions/route.ts`; `app/api/sessions/[id]/route.ts`; `app/api/sessions/[id]/actions/route.ts`; `app/(main)/progress/page.tsx`.
- `components/essay/{essay-screen,essay-topbar,coach-tab}.tsx`; `components/shell/new-essay.tsx`.

1. **The stated design authority contradicts both implementation specs — Blocker**  
   **Location:** 12 introduction/§2; 13 introduction/§8.  
   Both cite “Round 2” in the linked RFC, but that file now identifies itself as the current authority and points to a separate historical snapshot. Its adopted contracts differ materially: 38 catalog questions, family/version identity, separate continuation/rewrite relationships, and two initial checks with a shared retry budget. Document 13 instead permits five checks and 4,000 output tokens per call.  
   **Evidence:** `12_题库与推荐.md:7,28,47`; `13_速刷与主题卡片.md:9,148`; `docs/designs/question_bank_first_practice.md:6,26,49,141`; `data/question-bank/README.md:3`.  
   **Fix:** Reconcile both specs and their checklist with the current RFC, explicitly documenting any approved overrides and the existing catalog’s import mapping. Agents currently have incompatible implementation bases.

2. **Non-null evaluation does not mean feedback has been displayed — Blocker**  
   **Location:** 12 §1, §3, §7.  
   The completion definition equates displayed feedback with `evaluation != null`. The engine assigns and persists evaluation while still in `evaluating`, before a second review call. If that call fails, evaluation remains populated although the UI offers “retry evaluation.” A literal implementation would declare topic completion and unlock checkpoints for a failed flow.  
   **Evidence:** `12_题库与推荐.md:17,71,170`; `lib/pipeline/engine.ts:58,60,64,79`; `components/essay/essay-topbar.tsx:157`.  
   **Fix:** Specify the authoritative required-feedback commit event and make every consumer use it. Separate optional review failure from core completion, as the RFC requires at line 82.

3. **Checkpoint eligibility can be restored by deletion and lacks enforceable timing — Major**  
   **Location:** 12 §3, §6, §8–9.  
   Facts use surviving sessions, while deleting a session removes its history. Practise a reserved question, delete that attempt, then recompute: it becomes unseen again. Qualification is also recorded only at creation; no server deadline or completion-time validation is specified. The existing timer runs in the browser, so leaving the page stops it.  
   **Evidence:** `12_题库与推荐.md:66,159,162,207`; `lib/db/queries/sessions.ts:30`; `components/essay/essay-screen.tsx:150`; RFC: `docs/designs/question_bank_first_practice.md:128,130,132`.  
   **Fix:** Retain minimal exposure facts, enforce `deep/mock`, atomically allocate checkpoint starts, store a server deadline/submission timestamp, and qualify completed results before updating scheduling or baseline.

4. **Recommendation cannot reliably resume work or handle every legal state — Major**  
   **Location:** 12 §5.1; 13 §5.  
   Only draft cards receive a resume branch; unfinished Deep attempts fall into a “new” recommendation. The result contains no explicit resume attempt/card ID, despite allowing multiple attempts per question. Edited passed cards become `unchecked/finished` and are excluded from resume. If every ordinary question has only such a card, no candidate branch applies and the result type has no empty state.  
   **Evidence:** `12_题库与推荐.md:100,103,116,205`; `13_速刷与主题卡片.md:117`; `lib/learning/summary.ts:38`.  
   **Fix:** Return a discriminated result with `resumeAttemptId`, include Deep drafts and unchecked cards, define stable tie-breaks, exclude blocked questions from new work, and specify empty results.

5. **Quick persistence has no implementable request/version contract — Major**  
   **Location:** 13 §3–5, §9–10.  
   The document defines model schemas but not card-save, answer-save, excerpt, follow-up, or check API contracts. Existing PATCH rejects card fields; action schemas do not accept Quick operations. Atomic result writes alone do not prevent a check of version A from passing newly edited version B. `checking` recovery before transaction commit is unspecified.  
   **Evidence:** `13_速刷与主题卡片.md:81,114,124,169`; `lib/pipeline/schemas.ts:8–23`; `app/api/sessions/[id]/route.ts:21–24`; `app/api/sessions/[id]/actions/route.ts:19–29`.  
   **Fix:** Define endpoints/actions, payloads, card response/loading shape, content versions, persisted operation identity and recovery. Reuse session locking and optimistic writes; reject stale check results and verify excerpt ownership/text server-side.

6. **Quick-to-Deep links do not preserve the material used or prevent duplicate children — Major**  
   **Location:** 13 §6; 12 §1, §8.  
   Continuation stores only `sourceAttemptId` and displays the source card. Editing/deleting that card can change/remove the Deep attempt’s reference material. Retrying creation produces another child because POST currently creates a fresh UUID each time. Separately, free-choice repeats count as “fresh” simply because they lack a rewrite link, allowing repeated feedback on one question to manufacture recurring-focus evidence.  
   **Evidence:** `13_速刷与主题卡片.md:130–132`; `12_题库与推荐.md:19–20`; `lib/pipeline/initial.ts:19`; `app/api/sessions/route.ts:16–22`.  
   **Fix:** Freeze the card snapshot, validate source ownership/type, define continuation uniqueness, separate relationship types, and classify freshness by question-family submission history.

7. **Focus lacks a compatible producer and consumer contract — Major**  
   **Location:** 12 §5.1, §8.  
   Registering taxonomy codes does not make current diagnoses emit them: the scoring prompt supplies no taxonomy and accepts arbitrary code strings. Recommendation focus contains `{code,evidence}`, but existing session focus requires `name`, `instruction`, and `reason`. Exclusions store `issue:T06`, not bare `T06`. Directly copying the proposed result yields missing UI text and potentially ignores exclusions.  
   **Evidence:** `12_题库与推荐.md:108–121`; `lib/pipeline/engine.ts:52`; `lib/pipeline/schemas.ts:28`; `lib/prototype/types.ts:24`; `lib/learning/summary.ts:59`; `components/essay/coach-tab.tsx:75–76`.  
   **Fix:** Define versioned taxonomy input/output validation, exclusion-key conversion, and mapping into session `Focus`; keep focus disabled until that contract works.

8. **Legacy weekly credit moves whenever an old session is saved — Major**  
   **Location:** 12 §7.  
   Falling back to `updatedAt` makes an old completed essay count this week after a rating or other saved action. Its apparent completion date can move again later, changing totals and recency.  
   **Evidence:** `12_题库与推荐.md:178`; `app/api/sessions/[id]/actions/route.ts:22`; `lib/pipeline/engine.ts:35–38`. The current RFC explicitly prohibits this inference at `docs/designs/question_bank_first_practice.md:89`.  
   **Fix:** Preserve unknown historical completion dates separately; exclude them from dated totals and recency rules unless trustworthy original completion evidence exists.