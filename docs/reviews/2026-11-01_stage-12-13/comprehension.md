Read: persona=yes, standard=none, targets=yes

Files read (supporting files and code selectively):
- `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/agents/comprehension.md` — names no supporting standard.
- `AGENTS.md`
- `原型/12_题库与推荐.md`, `13_速刷与主题卡片.md`, `90_共享规范.md`, `00_总览.md`, `91_前端布局.md`, `99_实现清单.md`, `10_记忆整理.md`
- `docs/designs/question_bank_first_practice.md`
- `lib/pipeline/{types,initial,engine,schemas,lock}.ts`
- `lib/prototype/{types.ts,session-store.tsx}`
- `lib/learning/summary.ts`, `lib/db/schema.ts`, `lib/db/queries/sessions.ts`, `lib/llm/client.ts`
- `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/api/sessions/[id]/actions/route.ts`
- `components/shell/new-essay.tsx`, `components/essay/essay-screen.tsx`

**What this proposes.** Replace planned tasks with topic browsing and deterministic question recommendations. Add unscored Quick practice producing editable student-authored cards, continuation into Deep essays, weekly credits, and qualifying mock checkpoints.

**How the existing system works, per these documents.** Practice lives in session JSON, with legacy question identifiers and no implemented plan tables. Deep writing already supports coaching, evaluation, feedback and revision; its model-generated outline cannot guarantee verbatim student authorship.

1. **Blocker — The referenced authority specifies a different product.**  
   **Location:** Both targets, introductory “basis” references.  
   Both cite “Round 2 design,” which no longer exists in the linked RFC. That RFC declares itself authoritative and explicitly rejects several target contracts: overloaded `sourceAttemptId`, inferred historical completion dates, and the Quick budget. Two coding agents following these references would build incompatible schemas and behavior.  
   **Evidence:** `12_题库与推荐.md:7`; `13_速刷与主题卡片.md:9`; `docs/designs/question_bank_first_practice.md:6`, `:49`, `:89`, `:141`.  
   **Fix:** Reconcile the targets and supporting checklist with the current RFC, or explicitly identify a pinned historical version and enumerate decisions superseding the current RFC.

2. **Major — “Completed Deep” has incompatible runtime interpretations.**  
   **Location:** Document 12 §§1, 3, 7.  
   Non-null `evaluation` is equated with feedback having appeared. Running code persists evaluation before a subsequent review call, which can fail while the session remains `evaluating`. Separately, using mutable `updatedAt` for historical completion can move an old essay into this week after a save.  
   **Evidence:** `12_题库与推荐.md:17`, `:170`, `:178`; `lib/pipeline/engine.ts:58`, `:60`, `:79`; `app/api/sessions/[id]/route.ts:33`.  
   **Fix:** Define the exact required-feedback persistence event, distinguish optional review failure, and write one immutable completion timestamp. Keep unverifiable historical dates unknown instead of deriving them from later updates.

3. **Major — Resume recommendations cannot identify the attempt to resume.**  
   **Location:** Document 12 §5.1 and output schema.  
   The rule selects the most recently updated draft card, but returns only a question ID and an undefined-for-resume `sourceAttemptId`. Two draft cards on the same question are expressly possible. The client cannot reliably know which session to open. Unfinished Deep attempts also fall into a “new” candidate branch rather than a defined resume branch.  
   **Evidence:** `12_题库与推荐.md:100`, `:102`, `:116`, `:205`, `:220`.  
   **Fix:** Use a discriminated resume result containing `attemptId` and optionally `cardId`; explicitly handle unfinished Deep attempts and preserve their existing activity and focus.

4. **Major — Deleting practice restores “unseen” eligibility.**  
   **Location:** Document 12 §§2–3, 6, 9.  
   Exposure is reconstructed from surviving sessions, and deletion removes the session and card. Practise a reserved question, delete the attempt, then request a checkpoint: nothing specified preserves its prior exposure. Creating a replacement question ID can similarly reset exposure; fuzzy matching only covers unresolved legacy sessions.  
   **Evidence:** `12_题库与推荐.md:28`, `:66`, `:74`, `:77`, `:159`, `:207`; `lib/db/queries/sessions.ts:30`.  
   **Fix:** Persist minimal familiarity facts independently of deletable content and identify equivalent questions by a stable family key. Account deletion should remove those facts.

5. **Major — Checkpoint scheduling and qualification lack a completion boundary.**  
   **Location:** Document 12 §6 and §8.  
   A “qualified checkpoint” is defined at creation, while the 14-day interval refers to the previous qualified checkpoint without specifying its timestamp or completion requirement. Starting and abandoning one could suppress invitations for two weeks. The stated 40-minute condition has no deadline or late-submission rule; current elapsed time is client supplied.  
   **Evidence:** `12_题库与推荐.md:154`, `:158`, `:162`; `app/api/sessions/[id]/route.ts:31`.  
   **Fix:** Schedule from the last eligible completion, expose an in-progress state, enforce Deep/mock creation, and specify server deadline and final eligibility checks.

6. **Major — Editable cards can exhaust their only route back to “passed.”**  
   **Location:** Document 13 §§5, 8.  
   A student can pass on check five, edit the card, and become `unchecked`; the lifetime five-check ceiling then prevents revalidation. No recovery is defined. The state table also leaves `unchecked` sessions `finished`, while “save for later” says the session remains `quick`; a failed recheck’s resulting session stage is unclear.  
   **Evidence:** `13_速刷与主题卡片.md:117`, `:119`, `:121`, `:148`; `12_题库与推荐.md:100`.  
   **Fix:** Specify transitions for edits, failed rechecks and saves; include unchecked cards in resume behavior; define a bounded replenishment/recheck policy with explicit exhaustion UI.

7. **Major — Quick-to-Deep continuation has no stable content or identity contract.**  
   **Location:** Document 13 §6.  
   The new essay merely points to the Quick session and displays its card. Editing or deleting that source can change or remove the essay’s reference material. Repeating the creation request can produce duplicate children because the existing creation endpoint always creates a session.  
   **Evidence:** `13_速刷与主题卡片.md:130`; `app/api/sessions/route.ts:16`; `lib/pipeline/initial.ts:19`; RFC `:60`, `:77`.  
   **Fix:** Copy a frozen card snapshot, define source-deletion behavior, and persist an idempotent default-continuation mapping with an explicit separate action for additional practice.

8. **Major — Focus assumes a taxonomy contract the evaluator does not implement.**  
   **Location:** Document 12 §5.1; shared specification §4.1.  
   Registering codes and filtering unknown ones does not make new diagnoses use those codes. The current evaluator receives no taxonomy definitions and accepts arbitrary strings. Also, the proposed `{code,evidence}` focus cannot directly replace the existing `{code,name,instruction,reason}` object despite saying to reuse the field.  
   **Evidence:** `12_题库与推荐.md:109`, `:111`, `:121`; `90_共享规范.md:180`; `lib/pipeline/engine.ts:52`; `lib/pipeline/schemas.ts:28`; `lib/prototype/types.ts:24`.  
   **Fix:** Specify taxonomy-versioned diagnosis input/output and the mapping into session focus. Keep focus disabled until that contract is implemented and validated.