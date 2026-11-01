Read: persona=yes, standard=zoom-out-standard.md, targets=yes

Files read, in full or relevant excerpts:
- Persona: `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md`
- Standard: `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/resources/document_standards/zoom-out-standard.md`
- `AGENTS.md`, `README.md`
- `原型/12_题库与推荐.md`, `原型/13_速刷与主题卡片.md`, `原型/90_共享规范.md`, `原型/00_总览.md`, `原型/91_前端布局.md`, `原型/99_实现清单.md`, `原型/10_记忆整理.md`
- `docs/designs/question_bank_first_practice.md`
- `lib/pipeline/{types,initial,schemas,engine,lock}.ts`, `lib/prototype/types.ts`, `lib/prototype/session-store.tsx`, `lib/learning/summary.ts`, `lib/db/schema.ts`, `lib/db/queries/sessions.ts`, `lib/llm/client.ts`
- `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/api/sessions/[id]/actions/route.ts`
- `components/essay/essay-screen.tsx`, `components/essay/essay-topbar.tsx`

1. **Recommendation cannot represent several valid states — Blocker**  
   Location: 12 §5.1; 13 §5.  
   Evidence: `原型/12_题库与推荐.md:100`, `:102`, `:117`; `原型/13_速刷与主题卡片.md:117`.

   Resume handles only draft/needs-development cards. If every question has an unfinished Deep attempt and no completed work, the fallback selects one but recommends Quick under step 4, abandoning the existing activity. If every card was passed and then edited, all become `unchecked` with finished sessions: none matches any candidate branch. The output also lacks an explicit attempt ID for resuming one of several attempts.

   Fix: define one active, non-reserved recommendation pool; resume existing Quick/Deep work using an explicit attempt ID; include unchecked cards; return a named empty result when nothing is selectable.

2. **“Completed Deep” has conflicting meanings in the running pipeline — Major**  
   Location: 12 §§1, 3, 7.  
   Evidence: `原型/12_题库与推荐.md:17`, `:170`; `lib/pipeline/engine.ts:58`, `:60`, `:61`, `:79`; `lib/learning/summary.ts:37`.

   The spec equates feedback having appeared with `evaluation != null`. Existing code persists evaluation before an additional model review finishes. If that review fails, evaluation exists while the session remains evaluating. Recommendation/checkpoint facts could count completion while weekly credit and Continue disagree.

   Fix: specify one server-side completion boundary and make every consumer use it. Persist required feedback and immutable `completedAt` together; explicitly decide whether the additional review is optional. Actual browser viewing should not determine completion.

3. **Checkpoint qualification is not preserved through its lifecycle — Major**  
   Location: 12 §§6, 9.  
   Evidence: `原型/12_题库与推荐.md:154`, `:162`, `:207`; `lib/db/queries/sessions.ts:30`; `components/essay/essay-screen.tsx:156`; `components/essay/essay-topbar.tsx:82`.

   Qualification is defined at creation, without specifying a completed-checkpoint clock or submission deadline. Starting and abandoning one can therefore suppress invitations for 14 days. Practising a reserved question and deleting the attempt makes it unseen again because exposure uses surviving sessions. The current timer counts mounted-page seconds and merely warns after 40 minutes; it does not enforce a timed baseline.

   Fix: schedule from completed eligible checkpoints, retain minimal prior-practice facts after content deletion, and define server-recorded start/submission times and late-submission treatment.

4. **A transaction alone does not protect checked card content — Major**  
   Location: 13 §§5, 9, 10.  
   Evidence: `原型/13_速刷与主题卡片.md:124`, `:169`; `原型/90_共享规范.md:175`; `app/api/sessions/[id]/route.ts:21`; `app/api/sessions/[id]/actions/route.ts:19`.

   The spec describes committing a result atomically but never binds it to the card content checked. A student can edit from `/cards` while another page checks; a delayed pass can certify different content. Recovery by request ID also lacks a defined persisted running-operation contract.

   Fix: extend the existing session lock, optimistic version check, and pending-action mechanism to all card edits/checks/deletes. Identify the checked content version and reject stale results. Define crash recovery without leaving the card permanently `checking`.

5. **Source relationships do not define the content transferred — Major**  
   Location: 12 §§1, 5.1, 8; 13 §6.  
   Evidence: `原型/12_题库与推荐.md:19`, `:101`, `:188`; `原型/13_速刷与主题卡片.md:130`; `lib/pipeline/initial.ts:19`; `lib/pipeline/engine.ts:98`.

   A linked rewrite promises practice based on previous feedback, but only stores `sourceAttemptId`; neither creation nor coaching specifies loading that feedback. Quick→Deep displays a source card without defining whether it is a live reference or a snapshot. Editing or deleting the source can change or remove an ongoing essay’s reference.

   Fix: define owner-validated source lookup, the exact feedback/card context supplied to the new attempt, and deletion behavior. Freeze the card reference content at continuation creation and define retry behavior for creating the child attempt.

6. **The focus contract does not fit the existing producers or consumers — Major**  
   Location: 12 §§5.1, 8.  
   Evidence: `原型/12_题库与推荐.md:111`, `:121`, `:196`; `lib/prototype/types.ts:24`; `lib/pipeline/schemas.ts:28`; `lib/pipeline/engine.ts:52`.

   The proposed focus contains code/evidence, while the existing session focus requires name/instruction/reason. “Reuse the focus field” leaves this conversion undefined. More fundamentally, existing diagnosis accepts arbitrary code strings and supplies no taxonomy definitions, so adding a registry does not make new diagnoses reliably produce T/L codes.

   Fix: explicitly map recommendation evidence into an extended existing Focus contract. Supply canonical definitions to diagnosis and validate new codes there; retain the documented no-focus fallback for unusable historical evidence.

7. **The five-check limit creates a permanent editing dead end — Major**  
   Location: 13 §§5, 8.  
   Evidence: `原型/13_速刷与主题卡片.md:121`, `:122`, `:148`.

   A card can pass on check five, then become unchecked after an edit. The promised recheck is now forbidden for the lifetime of that attempt. Creating another attempt would contradict same-card continuity and could award another credit.

   Fix: specify post-limit behavior and a bounded later recheck allowance on the same card. Keep original credit and follow-up usage unchanged.

8. **Question-type templates cannot establish every actual task requirement — Major**  
   Location: 13 §§2, 4; 12 §2.1.  
   Evidence: `原型/13_速刷与主题卡片.md:51`, `:52`, `:57`, `:87`; `原型/12_题库与推荐.md:30`.

   The catalog stores only a broad type, but checking needs question-specific information. For a causes-and-solutions prompt, `cause` is optional while two problems are mandatory. An agent can implement the table exactly and pass a card that never answers the causes question.

   Fix: author the required subquestions and conditional fields in seed data. Use type templates for layout, then check the actual task requirements. This avoids inventing a runtime question parser.

9. **Mutable timestamps move historical credit between weeks — Major**  
   Location: 12 §7.  
   Evidence: `原型/12_题库与推荐.md:178`; `app/api/sessions/[id]/actions/route.ts:22`.

   Using legacy `updatedAt` as completion time means rating or revising an old evaluated essay can move its credit into this week.

   Fix: keep unknown historical completion dates outside dated totals, or freeze an explicitly approximate legacy date once. Never recalculate completion from subsequent saves.