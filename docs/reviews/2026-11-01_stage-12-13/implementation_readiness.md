Read: persona=yes, standard=implementation-readiness-standard.md, targets=yes

Files read (supporting files include relevant sections):
- `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/agents/implementation_readiness.md`
- `/Users/chen/.claude/plugins/cache/egm/egm/0.1.0/resources/document_standards/implementation-readiness-standard.md`
- `原型/12_题库与推荐.md`, `原型/13_速刷与主题卡片.md`
- `原型/90_共享规范.md`, `原型/00_总览.md`, `原型/91_前端布局.md`, `原型/99_实现清单.md`, `原型/02_领取任务.md`
- `lib/pipeline/{types,schemas,initial,engine}.ts`
- `lib/prototype/types.ts`, `lib/db/schema.ts`, `lib/db/queries/sessions.ts`
- `lib/learning/summary.ts`, `lib/llm/client.ts`
- `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/api/sessions/[id]/actions/route.ts`

1. **Quick-session persistence and action contracts are missing — Blocker**  
   **Location:** Document 13 §§3–5, 9; document 12 §8.  
   The model-output schemas do not define browser-to-server contracts for saving cards, saving answers, requesting follow-ups, checking, or retrieving cards. Existing PATCH accepts only essay-related fields; existing actions have no quick operations. Independently implementing frontend and backend requires inventing incompatible contracts.  
   **Evidence:** `原型/12_题库与推荐.md:186`; `原型/13_速刷与主题卡片.md:81`; `lib/pipeline/schemas.ts:8`.  
   **Fix:** Specify routes/action names, request and response schemas, version/request-ID handling, ownership checks, and errors. Name the route, schema, query, and client files to change.

2. **Non-null evaluation does not mean feedback completed — Major**  
   **Location:** Document 12 §§1, 3, 7.  
   The completion definition equates displayed feedback with `evaluation != null`. Running code persists `evaluation` before a second feedback-model call. If that call fails, evaluation remains non-null while the stage remains `evaluating`. The proposed predicate would credit an unfinished attempt, unlock checkpoints, and potentially recommend rewriting it.  
   **Evidence:** `原型/12_题库与推荐.md:17`; `原型/12_题库与推荐.md:170`; `lib/pipeline/engine.ts:58`; `lib/pipeline/engine.ts:79`.  
   **Fix:** Define one completion predicate based on successful feedback completion; stamp `completedAt` at that transition. Specify legacy handling for partially evaluated sessions rather than using evaluation presence alone.

3. **Recommendation selection is not total or fully deterministic — Major**  
   **Location:** Document 12 §5.1.  
   Complete quick cards for every ordinary question, then edit every card: all become `unchecked`, with finished sessions. There are no draft cards, unseen questions, passed cards, unfinished attempts, or completed deep attempts. No branch returns a recommendation, although the return type requires one. Equal counts across different question types also lack an explicit tie-break.  
   **Evidence:** `原型/12_题库与推荐.md:100`; `原型/12_题库与推荐.md:104`; `原型/13_速刷与主题卡片.md:117`.  
   **Fix:** Define an exhaustive fallback or nullable result, explicitly handle `unchecked`, and specify a total ordering across types and questions. Add tests for these states.

4. **Resume recommendations cannot identify the selected attempt — Major**  
   **Location:** Document 12 §§5.1, 10.  
   Multiple attempts per question are permitted. The rule selects the most recently updated draft card, but `Recommendation` has no `cardId` or `resumeSessionId`; `sourceAttemptId` is defined for creating linked attempts. With two drafts for the same question, the frontend cannot unambiguously open the chosen draft from this result.  
   **Evidence:** `原型/12_题库与推荐.md:100`; `原型/12_题库与推荐.md:116`; `原型/12_题库与推荐.md:205`.  
   **Fix:** Use a discriminated result with an explicit resume session/card ID. Specify that resume navigates without calling session creation.

5. **Checkpoint eligibility and completed checkpoint history are conflated — Major**  
   **Location:** Document 12 §§6, 8.  
   A “qualified checkpoint” is defined at creation, while cooldown and baseline use that same term. Starting and abandoning the first checkpoint can therefore trigger a 14-day cooldown and designate a baseline attempt with no score. Creation rules also do not explicitly enforce `checkpoint=true ⇒ activity=deep, mode=mock`; the current mode default is practice.  
   **Evidence:** `原型/12_题库与推荐.md:154`; `原型/12_题库与推荐.md:162`; `原型/12_题库与推荐.md:193`; `lib/pipeline/schemas.ts:7`.  
   **Fix:** Separate start eligibility from completed eligible checkpoints. Base cooldown and baseline on completed scored attempts, define timestamp ordering, and reject incompatible activity/mode combinations.

6. **Check results can be applied to a different card revision — Major**  
   **Location:** Document 13 §5.  
   An atomic transaction does not establish that the checked text is still current. One tab can start checking revision A while another saves revision B; without a specified lock or version comparison, A’s passing result can mark B passed. `check_version` exists but its meaning is undefined.  
   **Evidence:** `原型/13_速刷与主题卡片.md:124`; `原型/90_共享规范.md:175`; `app/api/sessions/[id]/route.ts:24`.  
   **Fix:** Define card revisions, bind each request/result to one revision, and specify whether concurrent edits are rejected or stale results discarded. Define durable request-result storage and crash recovery, with concurrency tests.

7. **Editable passed cards can exhaust their lifetime checking allowance — Major**  
   **Location:** Document 13 §§5, 8.  
   A card that passes on check five may subsequently be edited, becoming `unchecked`, but no checks remain. The lifecycle promises rechecking without defining this terminal state. Recheck failure also conflicts with `unchecked → finished`: the table maps `needs_development` to `quick`, and “save for later” unconditionally keeps the session quick.  
   **Evidence:** `原型/13_速刷与主题卡片.md:111`; `原型/13_速刷与主题卡片.md:119`; `原型/13_速刷与主题卡片.md:148`.  
   **Fix:** Specify a transition table covering post-pass checks and failures, budget exhaustion, and whether rechecks receive a separate allowance. State which events consume quota, including checks with all fields empty.

8. **Linked rewriting has no executable initialization rule — Major**  
   **Location:** Document 12 §§1, 5.1, 8.  
   The spec stores `sourceAttemptId` but never defines how a deep-source rewrite loads the original essay and feedback, chooses its starting stage, or validates its source. Existing `startRevision` operates inside the same session; normal creation starts with empty drafts. An agent can implement the ID while delivering an ordinary blank exercise.  
   **Evidence:** `原型/12_题库与推荐.md:19`; `原型/12_题库与推荐.md:101`; `lib/pipeline/initial.ts:19`; `lib/pipeline/engine.ts:27`.  
   **Fix:** Define source ownership/completion/question checks, draft initialization, feedback presentation, and deletion behavior. Explicitly distinguish deep-source rewriting from quick-card conversion.

9. **Question-specific checking requirements lack a defined source — Major**  
   **Location:** Document 13 §§2, 4.  
   Code must decide whether an advantages/disadvantages question requires judgement and extract two-part questions, but neither seed metadata nor a deterministic parsing algorithm is specified. Implementers must invent heuristics that determine what students must answer.  
   **Evidence:** `原型/13_速刷与主题卡片.md:51`; `原型/13_速刷与主题卡片.md:57`; `原型/13_速刷与主题卡片.md:87`.  
   **Fix:** Store validated per-question requirement metadata and subquestions in the seed schema, or specify exact parsing and fallback rules with acceptance cases.