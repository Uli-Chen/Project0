你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。WP1 已验收并提交（4e4f547、68fdcf1）。现在开始 **WP2a 兼容读取与只读外壳（QB-04、QB-12）**。

## 工作环境

- 仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。**不要提交、不要切分支、不要 push。** 不联网，不加新依赖。

## 先读

1. `AGENTS.md`；写页面、路由前读 `node_modules/next/dist/docs/` 中相关指南（App Router 页面、Route Handlers、服务端/客户端边界）。
2. 开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md` 第 3 节约定与第 4 节 WP2a。
3. `原型/90_共享规范.md` §4.1（会话 JSON 新字段表、读写规则 1–7、功能开关表）——本包的主要依据。
4. RFC `docs/designs/question_bank_first_practice.md` §9（迁移、回滚）。
5. 现有代码：`lib/pipeline/types.ts`、`lib/db/queries/sessions.ts`、`lib/pipeline/initial.ts`、`lib/pipeline/lock.ts`、`app/api/sessions/**`、`app/sessions/[id]/page.tsx`、`app/essays/[id]/page.tsx`、`components/essay/**`（`SessionProvider` 所在处）、`tests/`、`tests/ui`（或现有 UI 测试位置）。
6. 你的 WP1 报告 `docs/plans/reports/WP1.md` 末尾的负责人验收记录。

## WP2a 范围

- `SessionState` 加 90 §4.1 的全部新字段（`schemaVersion = 2`、`activity`、`question`、`lifecycle`、`lastStudentActionAt`、`continuedFromQuickId`、`cardSnapshot`、`rewriteOfDeepId`、`originalSubmittedAt`、`completedAt`、`feedbackUpdatedAt`、`checkpointId`），`Stage` 加 `quick`。本包只定义类型与读取默认值，不实现这些字段的业务写入（属于 WP2b 及之后）。
- `readSession(json)`：纯函数，按 `schemaVersion` 补默认值，**保留所有不认识的字段**，写回时原样保留；`getSession`、`listSessions` 以及任何读取 `state_json` 的地方都经过它。不批量改写旧记录；旧记录在下一次真实保存时才写成版本 2；不编造任何时间。
- 新建会话写 `schemaVersion = 2`、`activity = "deep"`、`lifecycle = "open"`，其余新字段按默认值。
- 页面在进入 `SessionProvider` 之前按 `activity` / `stage` 分派：不支持的会话（本包里：`activity = "quick"`、`stage = "quick"`、或任何未知 `activity`/`stage`）渲染只读视图（显示题目、已有文字，不显示作文按钮与动作）。
- 草稿 `PATCH` 与所有动作接口对不支持的会话返回 `409`，错误码 `unsupported_session`。判断写成一个共享函数（如 `isSupportedSession`），页面与接口共用。
- 功能开关 `lib/config/features.ts`：`QUESTION_BANK_ENABLED`、`QUICK_ENABLED`、`CHECKPOINTS_ENABLED`、`FOCUS_ENABLED`，环境变量，默认全部关闭；`QUICK_ENABLED`、`CHECKPOINTS_ENABLED` 只在 `QUESTION_BANK_ENABLED` 打开时生效（90 开关表）。本包只提供开关读取与组合逻辑并加单元测试，不接入任何新功能；`.env.example` 补上四个开关（默认 false）。

## 负责人已定的细节

- **旧记录的 `question` 字段**：`readSession` 保持纯函数，缺失时一律为 `null`，**不在读取时查别名表**。90 表中“经别名表解析”指的是 WP2b 迁移扫描写 `attempt_markers` / `familiarity` 时的解析，不写回会话 JSON。请在 90 §4.1 该行补一句说明（只改这一格的文字）。
- 旧记录 `lastStudentActionAt` 缺失为 `null`；`completedAt` 本包缺失为 `null`（事件表投影在 WP2b 接入）。
- 旧记录 `lifecycle`：`stage = finished` → `closed`，否则 `open`。
- 支持判断以 `activity` 为准：WP4 之前只有 `deep` 支持；`stage` 不在当前已知取值内也视为不支持。

## 验收测试（必须有对应测试）

1. 旧 JSON（无 `schemaVersion`、带若干未知字段，包括嵌套未知字段）经 `readSession` → 保存 → 再读，未知字段仍在且值不变；新字段默认值正确。
2. `readSession` 幂等：对版本 2 记录再读结果不变。
3. `activity = "quick"` 的会话：页面只读；草稿 `PATCH` 与动作接口都返回 `409 unsupported_session`，且数据库中的记录不变（`test:db` 或接口测试）。
4. 未知 `stage` 同上。
5. 开关：默认全关；`QUICK_ENABLED=true` 但 `QUESTION_BANK_ENABLED` 未开时，有效值为关。
6. 现有作文（`activity = deep` 或旧记录）的打开、编辑、动作行为与改动前相同：现有 `npm test`、`test:ui`、`test:db` 全部通过，不得为通过而删改原有断言；如必须调整原有测试，在报告里逐条说明原因。

## 文档没写清楚时

产品行为不清楚的，不自行决定：在报告“疑问”一节写出问题、候选方案、暂时采用的最保守做法。

## 完成后

1. 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
2. 写报告 `docs/plans/reports/WP2a.md`：改了哪些文件；每条验收测试对应哪个测试、是否通过；命令结果摘要；未完成事项；疑问。
3. 最后一条消息用三五行概括结果。
