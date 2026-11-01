# Question-bank-first practice with soft guidance

* **Author:** uli-chen (product direction); brief compiled by Claude Code
* **Date:** 2026-10-31
* **Status:** Brainstorm complete pending final owner review. Round 1 and Round 2 Goldfish reviews done; the owner accepted all proposed resolutions on 2026-10-31. The Round 2 review fixes have not been reviewed a third time. No code has been changed.

## Overview

project 0 helps Chinese students practise IELTS Writing Task 2 with a coach that works from the student's own ideas. The coach asks questions and gives directions. It never supplies arguments, model essays or templates.

The current design is plan-driven: questionnaire, then a mandatory onboarding mock test, then a weekly task plan computed by code. The owner considers this too mechanical. A plan that keeps targeting one weakness leads to repetitive practice and leaves much of the exam's topic range untouched.

The proposed direction:

1. **A bank of real past questions is the main entry.** Content sourcing is out of scope for now.
2. **Two kinds of activity.** Quick (速刷): the student writes a position and an outline only. The coach asks one or two follow-up questions, then a light check runs. No band score. Deep (精练): the existing full loop of writing, scoring, feedback, revision and comparison.
3. **Recommendations come from code rules, not from an agent.** The home page shows one main recommendation (question, activity, one-sentence reason), one or two alternatives, and the full bank one click away. A breadth line points Quick practice at topics and question types the student has not tried. A depth line points Deep practice at a skill issue that keeps recurring. Anti-repetition rules prevent the same focus or topic from being recommended over and over.
4. **A coverage map** (topic × question type) shows what the student has practised. Questions the student chooses freely also count.
5. **Pace from the questionnaire.** Exam date and sessions per week set a weekly count and activity mix, never specific questions. Missed sessions do not carry over.
6. **No mandatory onboarding test.** Starter suggestions come first. Mock checkpoints are recommended periodically, and the first eligible one becomes the score baseline.

Round 2 changed points 2–4. Quick mode now produces topic cards instead of feeding issue memory. Recommendations are topic-first: the student picks a topic, and the system recommends a question inside it. See "Round 2 design" below.

## Round 2 design

### Owner decisions in round 2

1. Quick-mode results do not feed issue memory. Instead, each passed Quick attempt produces a **topic card**: the student's own logic chain for that question, after the coach's check. Cards are for quick review of how to think about a topic.
2. Keep recommendations simple. Do not use topic as a recommendation signal. The student chooses a topic first, then takes the recommended question in that topic or picks any question themselves.
3. Correct the migration target (Round 1 finding 8). See "Migration" below.

### Topic cards

**What a card holds.** One card per passed Quick attempt, linked to the question by its bank ID. It holds the question, the question type, and the student's position and reasons. Each reason has its "why" and example, written in the student's own words. The structure follows the question type. For example, a "discuss both views" card has both views plus the student's opinion, and a "problem and solution" card pairs each problem with a solution (Round 1 finding 9).

**Objections and how the design answers them:**

* **"Passed review" needs a failure path.** If the check finds a gap after the follow-ups, the student must not lose the work. Save it as a draft card marked "needs development" with the specific gap named. The student can complete it later. Only passed cards appear in the review view by default.
* **The card must stay the student's.** The existing rule for idea material (`原型/10_记忆整理.md` section 4) already says: only the user's own words count, and a coach direction such as "think about it from a social angle" is not material. Apply the same rule here: the coach never writes into a card. The existing prewriting path is not enough to guarantee this. When the model's quoted `source` appears in a student message, it saves the model's own `text` into the slot (`lib/pipeline/engine.ts:99-100`), and the spec admits that added meaning is not checked (`原型/03_写前梳理.md:72`). Card content must therefore be text the student typed into the card, or exact excerpts the student selected from their own messages. The model may name gaps ("reason 2 has no example") but never rewrites card text. Each part stores the student message ID it came from and whether it followed a coach follow-up question.
* **A card for one question has limited reuse.** The exam will almost never repeat the question. What carries over is the reasons and examples, which often fit other questions in the same topic. The review view should therefore group cards by topic and show reasons and examples first, rather than only listing questions.
* **Overlap with existing idea memory.** The spec already plans "my material" (素材) grouped by topic, extracted from the student's words (`原型/10_记忆整理.md` section 4). Topic cards should become the student-facing form of that material, not a second store. Deep essays can add material to the same topic view later.
* **Memorising cards could look like memorising templates.** The difference is authorship: the student wrote the ideas. Reusing one's own prepared ideas is ordinary IELTS preparation. This holds only while the coach-never-writes rule holds, so pilot sampling should check it (Round 1 finding 7).

**What Quick still does not do:** no band score, no T or L issue memory updates (Round 1 finding 1 resolved this way).

**Card lifecycle.** Each Quick attempt has exactly one card, unique by user and attempt.

* **Save for later** ends the session with a draft card.
* **Resume draft** reopens the same attempt and the same card. It does not create a new card.
* **Recheck** updates that card. If it passes, the same card becomes passed.
* Editing a passed card later marks it unchecked until it is checked again.
* The check result, card state and completion time are saved in one database transaction, after the model call returns. A retry therefore cannot create a second card or a second credit.
* Deleting the source session or the account deletes its card.

The card table exists because cards have their own lifecycle and a review view. It does not, by itself, remove the need to scan session history (see Migration).

### Topic-first recommendation

**Home page, in priority order:**

1. An unfinished session, if any: "Continue".
2. A mock checkpoint card, only when one is due (rule below).
3. The topic list. Each topic shows how many questions the student has practised in it, how many cards they have, and when they last practised it. There is no ranking or "recommended topic". A topic the student has never practised shows a plain "not practised yet" label.
4. "Continue with last topic" as a shortcut.

**Inside a topic:** one recommended question with its activity and a one-sentence reason, then the full question list for that topic. A question can have several attempts, so each question shows separate indicators rather than one status: card (passed or draft), Deep essay (finished or in progress), and a "resume" action when something is unfinished. Opening a question shows its attempt history. Topic counts are distinct questions; card counts are cards. The student can start any question in either activity.

**The rule (code, deterministic).** Branches are checked in order; the first branch that applies decides the recommendation.

1. **Unfinished draft card in this topic:** recommend resuming it. Do not open a new attempt on that question.
2. **Topic exhausted** (every question in the topic has a finished Deep essay): recommend a rewrite of the question whose most recent finished Deep essay is oldest. Tie-break by bank order. The rewrite is linked to the earlier essay. Show the topic with the fewest practised questions as the alternative. This branch skips steps 3–5.
3. **Candidates:** questions in the topic that the student has never attempted. If there are none, questions that have a card but no finished Deep essay.
4. **Activity:** Quick if the student has neither a passed card nor a finished Deep essay in this topic. Otherwise Deep. A student who already writes full essays in the topic is not sent back to outlines. A card is reusable material, not a readiness test.
5. **Question type and tie-break:** among the candidates, prefer the question type the student has finished least across all topics. Tie-break by bank order.
6. **Focus (Deep only, applied after the question is chosen):** an issue code qualifies only if:
   * it was reported in both of the student's two most recent fresh original Deep drafts (linked rewrites do not count);
   * it fits the chosen question's type. For example, T06 applies only to `agree_disagree` and `discuss_both` (`原型/90_共享规范.md:126`);
   * the student has not excluded it.

   If several codes qualify, take the first in taxonomy order. If none qualify, attach no focus. The reason line is built from the actual supporting essays and their dates. The focus never changes which question is chosen.

**Linked rewrites.** A rewrite from step 2 stores the earlier attempt's ID. It is feedback-informed, like a revision, so it is excluded from the recurrence count in step 6 (`原型/10_记忆整理.md` excludes revisions for the same reason). It counts as a Deep completion for the weekly count.

**Why this is simpler than Round 1:** no coverage grid, no consecutive-topic rule, no breadth-versus-depth precedence. The inputs are the student's attempts in this topic, finished counts per question type, and the two most recent fresh original Deep drafts. Within a topic, repetition is avoided by construction until the topic is exhausted. After that, the "most recent essay is oldest" rule rotates through the questions, because each rewrite makes its question the most recently practised one.

**Acceptance cases for the rule** (from the Round 2 review):

* Deep essays on A and B, no cards, C untouched: recommend Deep on C.
* Deep essays on A and B, the only two questions, no cards: rewrite whichever has the older latest essay. After that rewrite, recommend the other one.
* T06 in the two latest fresh essays, chosen question is problem-and-solution: no focus.
* T06 in two early essays but not in the two latest: no focus.
* Draft card on B: recommend resuming B, not a new attempt.

**Mock checkpoints.** A checkpoint card is in one of three states:

* **Available:** a checkpoint is due and an eligible question exists.
* **Deferred:** the student skipped it. It returns after 7 days.
* **Unavailable:** a checkpoint is due but no eligible question exists. The card says so. It offers a repeat mock that is clearly labelled as not independent and is excluded from the baseline.

When a checkpoint is due:

* The first invitation appears after the student's first finished Deep essay, not on the first visit, so starter suggestions come first.
* After that, a checkpoint is due 14 days after the last eligible checkpoint.

Which questions are eligible:

* A question is eligible only if the student has no attempt on it and its exposure is known. Unknown legacy history does not count as unseen (see Migration).
* To keep a supply, the bank marks a few questions per question type as checkpoint-reserved. The topic recommendation never suggests reserved questions. Students can still pick them freely, and a reserved question picked that way stops being eligible.
* Eligibility is checked again when the checkpoint starts. The decision and its evidence are saved with the result.

**Weekly pace (first version):** shown as progress against the weekly count only, with Quick and Deep counts shown separately and expected minutes per activity (Round 1 finding 11). It does not enter the recommendation rule. Credit rules (accepted):

* A Quick attempt earns credit once, when its card first passes. A draft card earns nothing.
* A Deep attempt earns credit once, when feedback is first shown. It does not wait for optional model text.
* Continuing a card into a Deep essay earns a second credit, because it is a second activity.
* Credit is dated by its completion time, not by session creation.

**Strongest counter-argument to topic-first.** The owner's original worry was topic coverage. Topic-first hands topic breadth to the student, and some students will stay in the topics they find easy. The design answers this only softly, with per-topic counts and the "not practised yet" label. If the pilot shows students staying in two or three topics, add a weak nudge, for example listing unpractised topics first. Do not make topic a hard recommendation input. Topic-first also adds one choice before writing; "Continue with last topic" and the unfinished-session card keep the return path to one click.

### Migration

The running app has no `plan_tasks` table, and `/plan` already redirects to `/progress`. Retiring them needs no data migration. The actual migration is the session JSON in `writing_sessions.state_json`:

1. Add `schemaVersion` to `SessionState`. Read sessions through one adapter that maps a missing version to version 1, fills new fields with defaults, and keeps fields it does not recognise. There is no batch rewrite of old records. The existing writer saves the whole record (`lib/db/queries/sessions.ts:24-27`), so an old session is upgraded to the new version the next time it is saved.
2. New fields: `activity` (`quick` or `deep`) next to the existing `mode` (`practice` or `mock`); `questionId` pointing to the bank; and `sourceAttemptId` for linked rewrites. Existing sessions map to `activity: deep`.
3. **Legacy question identity.** Today every typed-in question gets a random ID, and so does every question chosen in the new-essay dialog, which also submits only text (`lib/pipeline/initial.ts:18`, `components/shell/new-essay.tsx:57`). Map old sessions to bank questions through a separate alias table: the three built-in IDs (`education`, `technology`, `society`) plus exact matches on normalised question text. Do not rewrite the old sessions. A session with no match has **unknown exposure**. It counts as unclassified in topic and type counts, and it never makes a bank question look unseen for checkpoint purposes. Old mock scores stay visible, labelled "earlier mock, eligibility unknown", and are not used as the baseline.
4. Topic cards go in their own table, linked by user, question and source attempt (see Card lifecycle). This does not remove session scans: topic counts, Deep status and question-type counts still come from sessions. For the pilot, compute them from the existing session list. Add a compact attempt summary table (question ID, activity, outcome, completion time, original-draft issue codes) only if measured history size makes the scan slow.
5. **Release and rollback.** First ship a build that reads both versions. Then enable Quick writes. "Reads both versions" is not enough for a rollback target. Any build that can be rolled back to after Quick writes are enabled must do one of two things: support the Quick lifecycle and card writes, or show Quick sessions read-only and reject Quick actions with a clear message. Either way it must not offer essay controls on a Quick session, and it must not drop the card table. Test rollback with a saved draft card, a passed card, and a check interrupted mid-request.
6. Remove the model-generated next-session plan text in `lib/pipeline/engine.ts:89` and the remaining plan entry points, so only the rule above recommends the next step.
7. Mark `原型/01_入门.md` (mandatory test), `原型/02_领取任务.md` (task pickup) and `原型/11_计划.md` (plan) as superseded.
8. `原型/90_共享规范.md` section 3 says bank questions are original or adapted, not copied official questions. That conflicts with "real past questions". Leave sourcing deferred, but record the conflict so the spec does not silently contradict the product.

These are design decisions only. No code has been changed in this brainstorm.

### Round 2 review

The same six lenses reviewed the first draft of this Round 2 design. As before, each reviewer was a separate Codex process (gpt-6-astra, read-only, ephemeral) and all six completed. The parent session verified the code claims marked below. The fixes have already been applied to the sections above.

| Finding (reviewers raising it) | Severity | Fix applied above |
| --- | --- | --- |
| Activity rule used "has a passed card" as a readiness test. A student with Deep essays and no cards was sent back to Quick forever. Steps 2 and 6 contradicted each other. "Rewrite the oldest essay" repeated the same question forever. (5 of 6) | Major | Ordered branches; Deep essays count as readiness; exhausted-topic branch is an explicit override; rotate by most recent essay; acceptance cases. |
| Focus rule had no recency window and no tie-break, and could attach an issue that does not fit the question type (T06 on a problem-and-solution question). Its reason text claimed "your last two essays" without that evidence. (6 of 6) | Major | Two most recent fresh drafts; question-type filter; taxonomy-order tie-break; reason built from actual dates. |
| A rewrite counted as a new original draft, so one weakness could reach the two-draft threshold by itself. (zoom-out) | Major | Linked rewrites excluded from recurrence. |
| The reused prewriting path saves model-written slot text when the quote matches (`lib/pipeline/engine.ts:99-100`, verified), so it cannot guarantee student-authored cards. (5 of 6) | Major | Card text is typed or selected by the student only; message IDs stored. |
| Card and session are saved separately, so a crash or retry can leave duplicate or missing cards and double credit (`app/api/sessions/[id]/actions/route.ts:26-29`, verified). (4 of 6) | Major | One card per attempt; single transaction; draft-to-passed updates the same card. |
| Checkpoints had no answer when every question was used up, skipping changed nothing, a new user saw a checkpoint on day one, and legacy sessions with no question ID made old questions look unseen. (6 of 6) | Major | Three checkpoint states; 7-day deferral; first invitation after first Deep essay; reserved questions; alias table; unknown exposure is not unseen. |
| "Adapter-aware build" only guaranteed reading. A rollback could still show essay controls on Quick sessions or overwrite new data. Old records are rewritten on their next save. (Blocker from implementation readiness; structural) | Blocker | Rollback build must support Quick or make it read-only; rollback test cases; upgrade-on-save stated. |
| The card table does not remove history scans; topic views still need session data. (4 of 6) | Major / Nit | Claim removed; pilot reuses the session scan; summary table only if measured. |
| One status per question cannot show a card plus an essay plus unfinished work. (comprehension) | Major | Separate indicators and attempt history. |
| Weekly credit is still undefined across drafts, passed cards, essays and continuations. (5 of 6) | Major | Credit rules defined above; accepted by the owner. |
| Quick still has no token, retry or time budget, and model calls are not logged per operation. Raised in Round 1 and still open. (design critic, codebase details) | Major | Accepted as a pilot prerequisite; limits not yet chosen. |

## Analysis

This section records the Round 1 review of the original concept. Findings 1, 5, 8 and 9 are resolved or changed by the Round 2 design above.

Six Goldfish reviewers each read the concept and the relevant design docs and code with no conversation history. The reviewers ran as separate Codex processes (gpt-6-astra, read-only, ephemeral, no project instructions loaded). The parent session then checked several of their code claims; checked claims are marked "verified".

| Reviewer lens | Status |
| --- | --- |
| Design critic (cost, scaling) | completed |
| Codebase details (observability) | completed |
| Zoom-out (simplicity, reuse) | completed |
| Comprehension (naive reader, UX) | completed |
| Implementation readiness (migration) | completed |
| Structural (long-term maintenance) | completed |

The findings below are deduplicated and ordered by how many reviewers raised them and by severity.

### 1. Quick-mode evidence would corrupt the depth line (raised by 5 of 6)

The concept says Quick mode feeds thinking-type (T) issue memory, which then drives Deep recommendations. The reviewers gave three reasons this is unsafe:

* **Some T issues need a full essay to judge.** The taxonomy in `原型/90_共享规范.md:61-69` defines T09 by the conclusion and T01 partly by consistency between introduction and conclusion. An outline cannot show either. If a missing conclusion counts as a weakness, or its absence counts as "fixed", the memory is wrong.
* **The Quick check runs after coaching.** What it records is the assisted result, not the student's own first attempt. The existing rules already count only original drafts for this reason (`原型/10_记忆整理.md`).
* **Volume.** Quick attempts are cheap, so they could outnumber essays and dominate recurrence counts. That would recreate the narrow focus the owner wants to escape.

The current code makes this worse. `buildMemory` in `lib/learning/summary.ts` labels every issue `kind: "thinking"` and sets `checked` to the number of all evaluated sessions, so "not assessed" and "not present" look the same (verified).

**Strongest counter-argument:** Some things are visible in an outline: a clear position, a reason with no "why", a question part left unanswered.

**Recommendation from zoom-out:** In the first version, keep Quick findings local to the attempt. Build the depth line from essays only. Later, if shared memory is needed, allow only a named outline-assessable subset of T codes. Store the source (outline or essay) and whether coaching came first. Record "not assessed" separately from "absent".

### 2. Activity depth and assessment conditions are two separate things (raised by 4 of 6)

Quick/Deep describes how much the student produces. The existing `practice | mock` field (`lib/prototype/types.ts:13`) describes whether the coach is allowed. The concept says "two modes" but also keeps mock checkpoints, which leaves mock as an unexplained third choice. If Quick/Deep replaces `practice | mock`, the progress chart loses its basis, because it charts only `mode === "mock"` sessions (`app/(main)/progress/page.tsx:17`).

**Recommendation:** Store two fields. Activity is Quick or Deep. Conditions are assisted or unassisted-timed. A mock checkpoint is Deep plus unassisted. The UI can still show three entry choices: Quick outline, Deep essay, and mock checkpoint.

### 3. "Completed" is not defined, so coverage, weekly counts and memory can disagree (raised by 5 of 6)

* Quick has no end state. The concept does not say what happens when the outline still lacks a "why" after two follow-ups, when practice counts, or how an outline continues into a full essay.
* In Deep mode, finishing currently requires another model call (`lib/pipeline/engine.ts:85-91`). A useful session can therefore stay uncounted when that call fails.
* Weekly credit is counted by `createdAt`, not completion time (`lib/learning/summary.ts:48`, verified). An essay started on Sunday and finished on Monday counts toward neither week.

**Recommendation:** For each activity, define the event that grants credit, and store a completion timestamp independently of optional model text. Quick needs explicit outcomes ("answered", "needs development"), a "save and finish" action, and a "continue as a Deep essay" action that keeps the question and the ideas. Decide whether that continuation is one attempt or two before building counts.

### 4. Coverage needs stable question identity and a real bank (raised by 6 of 6)

* The server has three built-in questions (`lib/pipeline/initial.ts:3-6`, verified). The new-essay dialog keeps a separate list and submits only the question text.
* Any text-supplied question gets a fresh random ID and empty topic tags (`lib/pipeline/initial.ts:18`, verified). The same question practised twice looks like two unrelated questions. Its question type is guessed by regex.
* The spec names seven topics and five types but requires only twelve questions (`原型/90_共享规范.md:116-124`). A 7 × 5 grid with twelve questions is mostly empty cells the student cannot fill.

**Recommendation:** Treat one canonical, versioned catalog as a prerequisite: stable IDs, reviewed question types, primary topic, and source. Start every bank practice by ID. Show cells with no available question differently from cells the student has not tried. Describe the map as "questions you have practised in this bank", not "exam coverage", and never as mastery. Decide how a question with several topic tags counts.

### 5. The recommendation rules conflict, and can recreate the rigidity they replace (raised by 6 of 6)

Breadth, the recurring issue, the weekly activity mix, a due checkpoint, and the two anti-repetition rules can each call for a different next step. The concept does not say which wins. "Not recommended consecutively" has no counting unit: page loads, displayed cards, accepted recommendations, or completed practice? With a small bank, hard exclusions can leave no candidate at all. The old planner had explicit fallback rules (`原型/11_计划.md:85-89`); the new concept has none. The zoom-out reviewer noted that moving the old constraints onto recommendation cards does not by itself make them less mechanical.

**Recommendation:** Write one deterministic recommendation function with a stated precedence order, a tie-break, and one fallback for an empty candidate list. Count repetition from completed practice, including freely chosen questions, not from page views. Make the repetition limits soft preferences, not hard exclusions. Begin with the simplest version: choose between an untouched available question (Quick) and an essay for a supported recurring issue (Deep). Add pace-based rules only after seeing real repetition or avoidance.

### 6. The first mock is not automatically an independent baseline (raised by 4 of 6)

A student can practise a question in Quick mode with coaching, then meet the same question as a mock checkpoint. No coaching happens during the timed attempt, but the student has already rehearsed it. Today, mock questions are drawn randomly from the same three-question pool with no exposure check.

**Recommendation:** Pick checkpoint questions the student has never practised. Record prior exposure and timing conditions. A single eligible checkpoint is a baseline, not a trend.

### 7. The success measure could reward avoidance of hard work (raised by 3 of 6)

Quick attempts are cheap. Session counts and filled cells could rise while full essays, revisions and checkpoints fall. Coach-supplied ideas could also make outlines look complete. The current success criteria in `原型/00_总览.md` measure completion of assigned plan tasks, which no longer exist in this concept.

**Recommendation:** Set pilot criteria before the pilot starts. Track distinct topics practised, plus completed Deep essays per student per week as a guardrail that must not fall. Also track revision uptake, checkpoint participation, and model cost per completed activity. Sample Quick conversations by hand to check whether the coach supplied arguments, and ask students whether the ideas were their own.

### 8. The migration question targets a design that was never built (Blocker from implementation readiness, also raised by structural and zoom-out)

The concept lists "retire `plan_tasks` and the plan page" as an open question. Neither exists in the running code. `/plan` already redirects to `/progress`, and the database has no `plan_tasks` table (verified). Each practice session is stored as one JSON blob in `writing_sessions.state_json` and parsed straight into `SessionState` with no version field. The real migration risk is therefore the session JSON: adding Quick sessions, a second dimension, and scoreless results changes a format that old code reads directly. A rollback after Quick sessions exist could break old readers. Restoring a pre-release backup would discard later work.

A remaining piece of the old plan approach does exist: `lib/pipeline/engine.ts:89` still generates next-session plan wording when a session finishes. If it is left in place, the app will have two systems recommending what to do next.

**Recommendation:** List what is actually stored before designing the change. Add a schema version to session JSON with an adapter for older sessions. Ship readers that understand the new format before allowing Quick writes. Remove the model-generated plan text together with any remaining plan entry points. Mark the superseded sections of `原型/01`, `02` and `11` as replaced.

### 9. The fixed outline template contradicts question-type-aware checking (raised by zoom-out)

The outline board always shows a position, two reasons with claim/why/example, and a counter-argument (`components/outline/outline-board.tsx:11-27`, verified). The opening message always asks for a position. That template fits "agree or disagree" questions. It does not fit "discuss both views", "problem and solution", or two-part questions. If the light check measures "all slots filled", Quick mode teaches the template that the product says it avoids.

**Recommendation:** Make the primary check whether the student's ideas answer what this question actually asks. Let slots that do not apply be left out. Test whether flexible slot labels are enough before building a separate outline per question type.

### 10. Quick mode is not cheap or fast by default (raised by design critic and codebase details)

The model client allows two attempts per call with `max_tokens: 16000` and a 120-second budget (`lib/llm/client.ts:13-20`, verified). Two follow-ups plus one check can therefore mean up to six provider attempts. Nothing records token usage or latency per operation, and the `llm_calls` log described in `原型/90_共享规范.md` was not implemented. Every page that computes coverage or recommendations also loads and parses the full JSON of every session.

**Recommendation:** Give Quick operations their own token, retry and time limits. Record usage and latency per operation. Compute coverage and recommendations from compact attempt summaries rather than full session JSON.

### 11. Smaller UX contradictions (raised by comprehension)

* "Silent by default" conflicts with "nudge at most once per paragraph", and new sessions currently start with `nudgesEnabled: true`. Decide whether nudges are opt-in, or describe them as passive cards.
* A weekly target of "3 sessions" treats a 10-minute outline and a 60-minute essay as equal. Show the expected time for each activity. Base the activity mix on the minutes the student said they have, not only on exam proximity.

## Goals vs. Non-Goals

* **In-Scope Goals:** a bank of real past questions as the main entry, browsed by topic; Quick activities that produce topic cards and Deep activities that run the full loop; a code-rule recommendation inside each chosen topic, with a visible reason; a topic-grouped review view of cards; per-topic practice counts; weekly pace shown from exam date and available time; periodic mock checkpoints on unseen questions; students can always choose any question and ignore recommendations.
* **Out-of-Scope Non-Goals:** sourcing and licensing question content; agent-driven planning or model-chosen questions; band scores for outlines; model essays or coach-supplied arguments in either activity; Task 1 and other exam sections; streaks, leaderboards or rewards; implementing anything during brainstorming.
* **Not yet decided:** initial bank size and topic list (the spec's seven topics are a starting point); how many checkpoint-reserved questions per type; numeric pilot success thresholds; the concrete Quick token, retry and time limits.

## Alternatives Weighed

* **Keep the plan-driven task list (current spec).** Rejected by the owner: too mechanical, and a plan that targets one weakness leads to repetitive practice and poor topic coverage.
* **Let an agent plan and pick the next question.** Rejected. Choosing the next question is a ranking problem, and the project principle is that code computes rankings and the model only writes the wording. A model call per recommendation adds latency and cost without a demonstrated benefit.
* **Tutor chat as the main entry.** Rejected. Students would have to converse before they can see and choose a question.
* **Enforce a personalised question sequence.** Rejected. It conflicts with free practice and amplifies incorrect diagnoses.
* **Keep a mandatory onboarding mock test.** Rejected. A 40-minute test before seeing the bank conflicts with soft guidance. Replaced by starter suggestions plus a recommended first checkpoint.
* **Unlock recommendations only after the first full essay.** Rejected. It leaves new students facing the whole bank with no guidance. The breadth line needs no diagnosis and can work from day one; the depth line is labelled provisional until an issue recurs.
* **Replace `practice | mock` with `quick | deep`.** Rejected during review. They are separate dimensions, and merging them loses score provenance.
* **Build a separate Quick workflow with its own coach and outline store.** Rejected during review. Existing prewriting already asks focused questions and fills outline slots (`lib/pipeline/engine.ts:93-104`). Reuse it and add a bounded check and a completion path.
* **Coverage grid with breadth and depth recommendation lines (Round 1 concept).** Replaced in Round 2 by topic-first recommendation. The grid needed a populated topic × type matrix, a precedence order between competing rules, and repetition history; topic-first needs none of these.
* **Quick results feeding thinking-issue memory (Round 1 concept).** Replaced in Round 2 by topic cards. Outlines cannot show some thinking issues, the check runs after coaching, and frequent Quick attempts would dominate recurrence counts.
* **Topic as a recommendation input.** Rejected by the owner for the first version, to keep the rule simple. Revisit only if the pilot shows students staying in a few topics.
* **Large bank with many filters first.** Deferred. Prefer a small curated catalog with stable IDs, and check that the pilot cells are populated before relying on the grid.

## Key Decisions & Staging for Next Steps

### Confirmed by the owner

* The core is still agent-assisted practice. Guidance is soft: recommendations steer, and the bank stays fully open.
* Recommendations are rule-based, not agent-based.
* Two activities: Quick (outline only) and Deep (full loop).
* Questions are real past questions; sourcing is deferred.
* Collect exam date and weekly availability, and use them for pace.
* Remove the mandatory onboarding test.
* Round 2: Quick produces topic cards and does not feed issue memory.
* Round 2: topic-first recommendation; topic is not a recommendation input.
* Round 2: the migration targets session JSON, as described in "Migration".
* Round 2 review: the revised recommendation rule, focus rule, card lifecycle, checkpoint states and rollback requirements above.

### Resolutions accepted by the owner (2026-10-31)

1. Store activity (Quick/Deep) and conditions (assisted/unassisted) as two fields; a mock checkpoint is Deep plus unassisted.
2. A canonical bank with stable IDs is a prerequisite for topics, cards, recommendations and checkpoints.
3. Weekly credit as proposed under "Weekly pace": Quick credit when a card first passes; Deep credit when feedback is first shown; a card continued into an essay earns two credits; credit is dated by completion time.
4. Checkpoints use questions with no attempt and known exposure, with a small reserved set per question type.
5. Pilot criteria include a guardrail that completed Deep essays per student per week must not fall, plus a check of how many topics each student practises.
6. The outline check and the card structure follow question type, not a fixed slot template.
7. **Pilot prerequisite:** Quick operations get their own turn, token, retry and time limits. Every model call is logged with its session, operation, duration, token usage and failure category, without essay text. A failed check ("needs development") must be distinguishable from a timeout or invalid output.

### Suggested first experiment

Pilot topic browsing, Quick practice with cards, and the in-topic rule. Success means students practise more distinct questions and question types without completing fewer essays, and rate cards as useful for review. Defer pace rules until the pilot shows they are needed.
