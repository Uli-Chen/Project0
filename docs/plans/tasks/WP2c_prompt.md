你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。WP1、WP2a、WP2b 已验收提交（最新 5736116）。现在开始 **WP2c 创建、生命周期与删除（QB-08、QB-11）**。

## 工作环境与测试分工

- 仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。**不要提交、不要切分支、不要 push。** 不联网，不加新依赖，不调用真实模型（启动任何进程时 `LLM_API_KEY` 置空）。不得打开或修改 `data/app.db`，不修改 `.claude/`。
- **全部测试由你完成**（开发方案第 6、7 节已更新）：单元、接口、数据库以及端到端验证。端到端在临时数据库上做；沙箱不能监听端口时，沿用 WP2b 的进程内路由与页面渲染方式（可复用 `docs/plans/reports/WP2b_e2e/` 的脚本思路），证据放 `docs/plans/reports/WP2c_e2e/`。

## 先读

1. `AGENTS.md`；改路由、页面前读 `node_modules/next/dist/docs/` 中相关指南。
2. 开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md` 第 3、6、7 节与第 4 节 WP2c。
3. RFC `docs/designs/question_bank_first_practice.md` §3（Attempt 一行与其后段落：completed ≠ closed，set aside ≠ deleted）、§6（blocking work、resume 排序依赖 latest student-action time）、§7（删除）、§9 第 6 条。
4. `原型/12_题库与推荐.md` §3（“删除练习时”一列）、§8 接口表；`原型/13_速刷与主题卡片.md` §3 `request_receipts`；`原型/90_共享规范.md` §4.1（字段、规则 3、开关表与“停用旧重点注入”一段）；`原型/11_计划.md` 开头横幅。
5. WP2a、WP2b 报告末尾的负责人验收记录。
6. 现有代码：`app/api/sessions/route.ts`、`app/api/sessions/[id]/route.ts`（DELETE）、`app/api/sessions/[id]/actions/route.ts`、`lib/pipeline/schemas.ts`、`lib/pipeline/initial.ts`、`lib/pipeline/engine.ts`（`finish`、`planChange`）、`components/essay/finish-summary.tsx`、`components/shell/new-essay.tsx`、`lib/db/practice-facts.ts`、`lib/db/request-receipts.ts`、`lib/db/question-context.ts`、`lib/config/features.ts`、账户删除接口（`app/api/auth/account`）、`scripts/test-db.ts`。

## WP2c 范围

1. **按题目创建** `POST /api/sessions`，新请求体 `{ questionId, activity, mode, idempotencyKey, rewriteOfDeepId? }`（Zod 判别：与现有 `{ kind, mode, prompt? }` 请求体并存，旧请求体行为不变）：
   - 读当前版本题目，冻结 `question` 快照（90 §4.1 字段），`prompt` 由快照生成，写 `attempt_markers`（复用 WP2b 函数）。
   - 经 `request_receipts` 按 `(user_id, idempotencyKey)` 去重：同键同参数返回同一会话（200，不新建）；同键不同参数 409。
   - `rewriteOfDeepId`：必须是本人、`activity = deep`、同一 `exposureKey` 的会话，否则 404/409；写入新会话。
   - 旧请求体（粘贴题目）创建时也经 `resolveQuestion` 记录 marker（不补 `questionId`，WP2b 决定 B）。
2. **生命周期** `POST /api/sessions/{id}/lifecycle` `{ action: "setAside" | "resume" | "close" }`：`open → set_aside`、`set_aside → open`、`open | set_aside → closed`、`closed → open`（resume 允许重新打开）。同状态重复请求幂等返回。`assertSameOrigin`、Cookie 用户、他人资源 404；不支持的会话 409 `unsupported_session`（90 规则 3）。生命周期变化不修改 `stage`、完成事件与家族事实。
3. **`lastStudentActionAt`**：学生真实编辑或操作时写入（草稿 PATCH 中正文 / 提纲确有变化、所有学生发起的动作、生命周期动作）；打开页面、GET、轮询、自动回顾状态更新不写。纯函数判断“是否学生操作”，配测试。
4. **删除练习** `DELETE /api/sessions/{id}`：同一事务内先 `markPracticeDeleted`（WP2b），再删除会话正文；会话之外现在还没有卡片 / 检查结果 / 操作输入表（WP4 才建），在代码中留一个集中删除函数，WP4 往里加表。删除后家族曝光与完成事件保留（`evidence_deleted = 1`）。账户删除后所有相关表（含六张事实表与 `questions` 以外的全部用户数据）为空。
5. **功能开关**：
   - `QUESTION_BANK_ENABLED` 关闭时，`questionId` 请求体返回 `403`，`code: "feature_disabled"`；旧请求体照旧。
   - `QUESTION_BANK_ENABLED` 打开时，停用旧的“取最近一条问题当重点”注入（`app/api/sessions/route.ts` 中 `kind === "task"` 分支），新会话 `focus = null`。关闭时保持原行为。
6. **删除计划残留（QB-11）**：删除 `finish` 中的 `planChange`（类型、提示词字段、界面显示 `finish-summary.tsx`）；结束页“下一步”改为链接：会话有 `question` 且题库开关打开 → `/topics/{primaryTopic}`（页面在 WP6 实现，本包只放链接），否则 → `/`。删除其他剩余的计划入口（按 11 开头横幅与 RFC §9 第 6 条核对，列出你删除了什么）。评分与诊断的提示词与输入不变（G-01）；若 `finish` 提示词含 `planChange` 字段，只删除该字段要求，在报告中贴出前后差异。

## 负责人已定的细节

- 本包内 `activity = "quick"` 一律返回 `409`，`code: "unsupported_activity"`（速刷在 WP4a 才可创建），无论 `QUICK_ENABLED`。
- 本包内 `mode = "mock"` 走 `questionId` 请求体一律 `409`，`code: "mock_requires_checkpoint"`（检查点在 WP7 接入）；`activity = deep` 只接受 `mode = practice`。
- 保留题（`pool = checkpoint_reserved`）允许直接创建精练；对检查点资格的影响在 WP7 处理。
- 题目不存在或不是当前版本 → 404。

## 验收测试（测试名写出情境；必须有对应测试）

1. 同一 `idempotencyKey` 并发 / 重复请求只建一个会话；同键不同参数 409。
2. 题目快照冻结：之后导入 v2 并切换当前版本，已有会话的 `question` 不变。
3. `rewriteOfDeepId` 合法 / 他人 / 不同家族 / 非 deep 四种情况。
4. 生命周期全部转移、幂等、他人 404、不支持会话 409；不改 `stage` 与完成事件。
5. `lastStudentActionAt`：编辑与动作更新；GET、打开页面、无变化的 PATCH 不更新。
6. 删除练习后：会话不在、`attempt_markers.deleted_at` 已写、完成事件 `evidence_deleted = 1`、家族曝光仍在（再次提交该家族为 `repeat`）。
7. 账户删除后所有用户相关表为空。
8. 开关：题库关时 `questionId` 请求 403、旧请求照旧；题库开时 `task` 会话不注入旧重点。
9. `finish` 结果不含 `planChange`；结束页“下一步”链接按两种情况正确。
10. 原有测试全部通过；必须调整原有断言时逐条说明原因（`planChange` 相关断言预期需要删除）。
11. 端到端（临时库）：按题目创建 → 写作 → 搁置 → 恢复 → 关闭 → 删除，每步的接口结果与数据库状态；结束页 HTML 中的“下一步”链接。

## 文档没写清楚时

不自行决定产品行为：在报告“疑问”一节写出问题、候选方案、暂时采用的最保守做法。

## 完成后

1. 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
2. 写报告 `docs/plans/reports/WP2c.md`：改动文件；每条验收测试对应的测试与结果；端到端步骤与证据路径；命令结果摘要；原有测试调整及原因；未完成事项；疑问。
3. 最后一条消息用三五行概括结果。
