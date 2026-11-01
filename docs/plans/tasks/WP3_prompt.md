你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。WP1～WP2c 已验收提交（最新 c9d5059）。现在开始 **WP3 模型调用：预留、限额与日志（QB-10）**。WP4a/4b 会直接使用本包的接口，所以先把接口定清楚。

## 工作环境与测试分工

- 仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。**不要提交、不要切分支、不要 push。** 不联网，不加新依赖，不调用真实模型（测试一律用假 fetch；启动任何进程时 `LLM_API_KEY` 置空）。不得打开或修改 `data/app.db`，不修改 `.claude/`。
- **全部测试由你完成**（开发方案第 6、7 节）。本包没有界面，端到端用临时数据库上的脚本验证即可，证据放 `docs/plans/reports/WP3_e2e/`。

## 先读

1. `AGENTS.md`；开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md` 第 3、6、7 节与第 4 节 WP3（接口草案）、第 5 节风险表第一行。
2. RFC `docs/designs/question_bank_first_practice.md` §8 全文（限额表、补充包、用户 24 小时上限、预留与核销、崩溃恢复、日志不含正文）。
3. `原型/13_速刷与主题卡片.md` §3（`llm_calls`、`quick_operations`、`quick_packages` 的关系）、§4（三段式）、§8（恢复）。
4. `原型/90_共享规范.md` §4.1 `llm_calls` 表、§6.3。
5. 现有代码：`lib/llm/client.ts`、`lib/llm/json.ts`、`lib/llm/admission.ts`、`lib/pipeline/engine.ts` 中 `generateJson` 的全部调用、`lib/db/schema.ts`、`scripts/test-db.ts`、已有 `tests/` 中假 fetch 的写法。

## WP3 范围

1. **`llm_calls` 表**（schema + `npm run db:generate` 追加迁移），列按 90 §4.1，外加 `prompt_config_version`（若 90 的 `config_version` 已覆盖则不重复）。`outcome` 增加 `reserved`（已预留、尚未结束）状态，或用 `outcome IS NULL` 表示进行中——二选一并在报告说明。外键只到 `users` 级联；删除练习时保留。**不存任何正文**（提示词、上下文、模型输出都不存）。
2. **预算配置** `lib/llm/budget.ts`：RFC §8 的全部数字作为带 `budgetConfigVersion` 的常量（初始包、补充包、单次调用上限、用户滚动 24 小时上限：15 次 / 60,000 输入 / 12,000 输出 / 300 秒）。
3. **`buildMessages`**：从 `lib/llm/client.ts` 抽出，返回实际发送的完整消息（系统提示、Schema、上下文、重试提示）。`estimateInputTokens(messages)` 按 UTF-8 字节数加版本化协议余量做“保守准入估算”（每 token 按 1 字节计即可，写清理由；宁可高估）。
4. **`reserveCall({ userId, operationId, packageId, purpose, sessionId, perCall, packageLimits, now })`**：在一个 `IMMEDIATE` 短事务里：
   - 用户滚动 24 小时（按 `started_at`）已占用 = 已结束调用的实际用量（用量未知时按预留值）+ 未结束 / `indeterminate` 调用的预留值；只计 `package_id` 非空（速刷）的调用。
   - 同一 `package_id` 已占用同理；对照调用方传入的 `packageLimits`（次数、输入、输出、等待秒数）。
   - 本次预留：输入 = 调用方给的估算（超过单次输入上限直接拒绝，原因 `input_too_long`）；输出 = 单次输出上限；时间 = min(单次 25 秒, 包剩余, 用户剩余)。任一上限不足 → 拒绝，返回结构化原因（`user_quota` / `package_quota` / `input_too_long`）和最早可再申请时间（用户窗口内最早一条调用滚出的时间）。
   - 通过则插入一行 `llm_calls`（进行中），返回 `Reservation`。写库失败抛错——调用方不得调用模型。
5. **`settleCall(reservation, { usage | null, latencyMs, outcome })`**：写实际用量（未知写 NULL，不写 0）、耗时、结果。核销写库失败时不抛到业务层（记录日志），该行保持预留值继续占额度。
6. **`generateJson(instruction, context, schema, options?)`**：`options = { purpose, userId, sessionId, operationId?, reservation?, maxInputTokens?, maxOutputTokens?, timeoutMs?, retries? }`。
   - 不传 options：行为与现在完全相同（16,000 输出 / 约 120 秒 / 2 次尝试，不写 `llm_calls`）。现有精练调用本包**不改**。
   - 传 `reservation`：只做一次 provider 尝试，用预留的输出上限与超时；结束后 `settleCall`。速刷需要自动重试时由调用方再次 `reserveCall`（每次尝试都重新预留，RFC §8）。
   - 传 `userId` 但无 `reservation`：照常调用，每次 provider 尝试写一行观测日志（`package_id` 为空），日志写失败不影响调用。
   - 结果分类：`ok` / `timeout` / `invalid_output` / `provider_error`；响应丢失（连接中断、进程在调用中重启）→ `indeterminate`。
7. **恢复** `recoverInflightCalls(now)`：启动时把所有进行中的行标为 `indeterminate`，保留预留值；接入现有 `instrumentation.ts`（失败只记日志）。

## 负责人已定的细节

- `quick_packages` 表与“发放 / 关闭包”的逻辑属于 WP4b；本包的包占用只按 `llm_calls.package_id` 汇总，`packageLimits` 由调用方传入。
- 用户上限只统计速刷调用；精练调用不受影响、不占用。
- 时间一律由参数 `now` 传入（规则函数纯函数），测试用可控时钟。

## 验收测试（测试名写出情境）

1. 成功：一行 `ok`，实际用量写入，额度按实际计。
2. 超时（假 fetch 延迟 + 可控时钟）：`timeout`，预留时间计入。
3. 不合格输出：`invalid_output`，带预留不自动重试。
4. usage 未知：`input_tokens` / `output_tokens` 为 NULL，额度按预留值占用。
5. 核销写库失败：调用方拿到模型结果，行保持预留值占额度。
6. 响应丢失 / 启动恢复：`indeterminate`，预留值保留，不自动重发。
7. 预留写库失败：抛错，假 fetch 未被调用。
8. **并发**：两张卡片（两个 `package_id`）同时预留，而用户只剩一次额度——真实临时 SQLite、两个进程两个连接，只有一个成功，另一个得到 `user_quota`。
9. 包上限、用户四项上限各自独立生效；滚出 24 小时窗口后恢复；换 `operationId` / 新建练习不重置用户额度。
10. 输入超长：`input_too_long`，不调用模型。
11. `llm_calls` 任何列都不含提示词、上下文、模型输出（测试里放一段独特正文，全表扫描断言不存在）。
12. 不传 options 时行为不变：现有全部测试（含 `agent`、`learning-flow`）通过，且不写 `llm_calls`。
13. `test:db`：空库全量迁移、旧库升级、删除练习后 `llm_calls` 保留、账户删除后为空。

## 文档没写清楚时

不自行决定产品行为：在报告“疑问”一节写出问题、候选方案、暂时采用的最保守做法。

## 完成后

1. 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
2. 写报告 `docs/plans/reports/WP3.md`：最终接口签名；改动文件；每条验收测试对应的测试与结果；端到端证据路径；命令结果摘要；原有测试调整及原因；未完成事项；疑问。
3. 最后一条消息用三五行概括结果。
