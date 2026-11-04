# Tutor browser acceptance — 2026-11-03

Environment: isolated Next dev at `http://localhost:3108`, temporary SQLite database, synthetic `tutor-e2e@example.test` account and local fake model. Native Chrome controlled through CUA. No production credentials or data used. Desktop dark appearance and DevTools 390 × 865 responsive viewport were inspected. Native screenshots were emitted in the tool conversation; no screenshot files were exported.

## Verified in browser

- Public `/privacy` opens without login and renders the notice in dark appearance; login/account privacy links are present.
- `/account` at 390 px renders language, thinking-language and new-session reminders controls. Changed explanation language to 中文, saved, observed success notice, and hard reloaded: 中文 remained selected. Seed initially had incomplete onboarding fields; root completed the synthetic seed before successful save.
- `/essays/tutor-feedback` initially shows the primary problem, original submitted quote, one 改这个问题 button and 还有 1 个问题. Expanding exposes the second problem.
- Clicking the second problem's 讨论 enters revision, opens the coach and focuses the composer with rank 2 / 解释原因 context after the merge fix below.
- Example card insertion changes to 已采用, and closing the mobile inspector exposes the inserted example text in the actual revision editor.
- `/essays/tutor-prewrite`: entered `这段还没有发送`, clicked 给点提示, observed a coach response while the unsent input remained unchanged. After a failed second response and successful retry, the second hint appears and the button becomes disabled with 试着先写下你的想法. Input remains unchanged across failure, retry, and viewport change.
- Failed request recovery controls are visible and operable inside the mobile inspector after the error-placement fix below.
- Switching back to desktop shows the outline, essay and coach columns with preserved composer state. Temporary unsent test text was cleared at the end.

## Browser-discovered fixes

1. A successful rank 2 startRevision response was merged with the old local rank 1 selection, then the stage transition initialized the composer with rank 1. `mergeSessionState` now accepts the server's validated issue on stage transitions while preserving local selection during same-stage polling. Added a failing-then-passing unit regression and repeated the actual 390 px flow successfully.
2. The request-error banner was underneath the mobile inspector sheet, making a model failure appear silent. `EssayScreen` now renders the same alert inside the mobile inspector while it is open. Browser verification observed the message and retry control, then successful recovery.

The local fake model initially emitted a new-thread track on a continuation request, correctly failing protocol validation. Root corrected that test fixture; retry then succeeded. This was not changed in application validation.

## Automated supporting evidence

Latest targeted run: 26/26 passing across `tests/tutor-api.test.ts`, `tests/agent.test.ts`, and `tests/tutor-privacy.test.ts`; 4/4 passing `tests/ui/tutor-feedback.test.ts`; ESLint passed all files changed during this browser review.

`tests/tutor-api.test.ts` uses real route handlers, auth request context and a temporary database with mocked model fetch. It verifies in-flight source deletion/change/exclusion rejection with preserved input and retryable=false; frozen retry language/flag; corrupt/future tutor rejection without mutation; replay and hint atomicity; invalid/valid startRevision rank; version/hash races; concurrent hint exclusion; and missing legacy snapshot rejection.

## Scope limits

The model was deterministic test infrastructure, so browser work validates integration and recovery rather than real-provider teaching quality. Default-off behavior is covered by automated rendering and feature tests, not a second browser deployment. The full acceptance matrix (all modes, lifecycles and failure combinations) is not claimed as manually exercised. Privacy publication still requires completing the existing draft placeholders and passing `npm run check:privacy`.
