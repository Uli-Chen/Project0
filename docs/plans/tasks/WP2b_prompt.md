你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。WP1（4e4f547）与 WP2a（cd6752b）已验收提交。现在开始 **WP2b 迁移扫描、提交标记与完成事件（QB-05、QB-06、QB-07）**。

## 工作环境

- 仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。**不要提交、不要切分支、不要 push。** 不联网，不加新依赖，不调用真实模型（测试用现有的模型替身方式）。

## 先读

1. `AGENTS.md`；涉及启动钩子（如 `instrumentation.ts`）或服务端代码时先读 `node_modules/next/dist/docs/` 中相关指南。
2. 开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md` 第 3 节约定与第 4 节 WP2b。
3. RFC `docs/designs/question_bank_first_practice.md` §3、§5、§6（“Fresh originals”一段）、§7（曝光未知）、§9、§10 验收表。
4. `原型/12_题库与推荐.md` §3（表结构）、§4（完成事件写入点与原稿接受四步）、§7（迁移扫描）、§9（用例 1、1b～1e、2、5）。
5. `原型/13_速刷与主题卡片.md` §3 中 `request_receipts` 的定义（本包只建表与通用读写函数，不接入速刷）。
6. `原型/90_共享规范.md` §4.1。
7. WP1、WP2a 报告末尾的负责人验收记录（`docs/plans/reports/WP1.md`、`WP2a.md`），尤其是别名解析冲突返回 `ambiguous` 的决定。
8. 现有代码：`lib/pipeline/engine.ts`（第 46 行附近原稿接受，第 51 行起评估两次调用）、`lib/pipeline/lock.ts`、`app/api/sessions/[id]/actions/route.ts`、`lib/db/queries/sessions.ts`、`lib/pipeline/read-session.ts`、`lib/rules/resolve-question.ts`、`lib/db/import-questions.ts`、`components/essay/**` 中显示提纲回顾的部分、`tests/agent.test.ts`、`tests/learning-flow.test.ts`、`scripts/test-db.ts`。

## WP2b 范围

1. **表**（`lib/db/schema.ts` + `npm run db:generate` 追加迁移）：`attempt_markers`、`completion_events`、`familiarity`、`legacy_scan`、`default_continuations`（12 §3），`request_receipts`（13 §3）。外键与删除语义按 12 §3“删除练习时”一列：只外键到 `users` 并级联的表在删除练习后保留。删除练习时写 `deleted_at` / `evidence_deleted` 的逻辑本包只提供函数与测试；接入删除接口属于 WP2c。
2. **原稿接受**（12 §4 四步，同一短事务，模型调用之外）：读 `familiarity` → 计算 `fresh` / `repeat` / `unknown` → 无条件写 `originalSubmittedAt` 与 `deep_original_submitted = known`（`unknown_time` 保持）→ `fresh` 时写 `fresh_attempt_id`；资格存会话 `originalFreshness`（新增字段，`readSession` 缺失为 `null`），评分重试读取保存值不重算。同时写 `attempt_markers`（如尚未写）。粘贴题目先经 `resolveQuestion`。计算逻辑写成 `lib/rules/` 下的纯函数。
3. **评估编排**：原稿评估第一次模型调用成功并通过校验后，同一事务写会话（`evaluation`、`stage = feedback`）与 `completion_events`（仅第一次；`completedAt` 投影）。第二次调用（提纲回顾）改为可选：`reviewStatus`（`none` / `pending` / `ok` / `failed`）与单独的重试动作；失败只影响回顾区，不回退阶段、不重跑评分、不影响完成。评分与诊断的输入、提示词不变（G-01）。界面上回顾区显示失败与“重试”按钮，其他界面不变。
4. **完成事件的读取**：`readSession` 之外提供按会话读取 `completedAt` 投影的方式，供 `getSession` / `listSessions` 使用（以事件表为准）。
5. **旧记录**（12 §4 末段）：已有完成事件的会话重评只写 `feedbackUpdatedAt`；没有完成事件的旧会话迁移后第一次满足反馈合同时照常写当前 `completed_at` 的事件，`original_submitted_at` 保持为空。
6. **迁移扫描** `scripts/migrate-0.4.ts`（加 npm 脚本）与启动时对未扫描用户执行一次（12 §7）：经 `readSession` 读全部会话；用别名表解析；写 `attempt_markers`、`familiarity`（旧提交/反馈记 `unknown_time`）、`stage = finished` 的旧完成事件（`legacy = 1`、`completed_at = null`）；无法解析的计入 `legacy_scan.unresolved_count`；**不改写会话 JSON，不从 `createdAt` / `updatedAt` 推算时间**。扫描幂等；新注册用户直接写 `unresolved_count = 0` 的 `legacy_scan`。启动执行失败不得阻止服务启动，但要记录日志，并保证未扫描用户在扫描完成前不会被当作“曝光已知”（说明你的做法）。

## 负责人已定的细节

- `request_receipts` 本包只建表并提供“按 `(user_id, idempotency_key)` 查/写回执”的通用函数与测试，不改造现有 `completedRequests` 去重。
- `originalFreshness`、`reviewStatus` 是会话 JSON 新字段，同样遵守 WP2a 的规则（缺失补默认值，未知字段保留）；请在 90 §4.1 字段表补这两行。
- 本包不接入 `QUESTION_BANK_ENABLED`：完成事件、曝光记录与迁移扫描不受开关控制（90 §4.1）。

## 验收测试（必须有对应测试，测试名写出情境）

- 12 §9 用例 1、1b、1c、1d、1e、2、5。用例 2（两个标签页同时提交同一家族）须在真实临时 SQLite 上并发执行，只能有一篇 `fresh`。
- RFC §10 中 “Required feedback saved; optional review fails…”、“Free-entry repeat…”、“Old finished record saved or regraded…” 三行。
- 迁移扫描：幂等；不改写任何会话 JSON（扫描前后整表逐字节相同）；无法解析时 `unresolved_count > 0` 且该用户所有当时家族为曝光未知；新用户 `unresolved_count = 0`。
- `test:db`：空库全量迁移、旧库升级；删除练习后保留记录的表仍在、正文表随练习删除。
- `tests/agent.test.ts`、`tests/learning-flow.test.ts` 及全部原有测试继续通过；必须调整原有断言时逐条说明原因（预期：评估编排变化可能影响原有流程测试）。

## 文档没写清楚时

不自行决定产品行为：在报告“疑问”一节写出问题、候选方案、暂时采用的最保守做法。

## 完成后

1. 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
2. 写报告 `docs/plans/reports/WP2b.md`：改动文件；每条验收用例对应的测试与结果；命令结果摘要；对原有测试的调整及原因；未完成事项；疑问。
3. 最后一条消息用三五行概括结果。
