你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。你在三轮审阅后已确认开发方案 v4。现在开始 **WP1**。

## 工作环境

- 仓库：/Users/chen/Desktop/opc，分支 `question-bank-0.4`（基线提交 985e11b）。
- **不要提交（commit）、不要切换分支、不要 push。** 只改工作区文件。
- 不联网，不加新依赖。

## 先读

1. `AGENTS.md`，以及 `node_modules/next/dist/docs/` 中与你要改的内容相关的指南（WP1 基本不涉及路由，但如需改服务端代码先读）。
2. 开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md`：第 1 节（流程）、第 3 节（10 条实现约定）、第 4 节 WP1、第 6 节（自测）。
3. RFC `docs/designs/question_bank_first_practice.md`（唯一行为依据），重点 §2、§3。
4. `原型/12_题库与推荐.md` §2（2.1 questions 表、2.2 每题要求、2.3 别名与负责人确认表）。
5. `原型/90_共享规范.md` §4.1 中与 `lib/taxonomy.ts` 相关的部分。
6. `原型/99_实现清单.md` 中 QB-01、QB-02、QB-03、QB-09。
7. `data/question-bank/` 下全部文件（`question_bank.mock.json` 等**冻结，不得修改**；只允许新增 `requirements.mock.json`）。
8. README 中关于迁移的说明、`lib/db/schema.ts`、`lib/db/initialize.ts`、`lib/db/sqlite.ts`、`scripts/test-db.ts`、`package.json`。

## WP1 范围

- `questions` 表：主键 `(id, version)`；`is_current = 1` 上 `id` 与 `bank_order` 的部分唯一索引；同一 `(id, version)` 内容（含 `requirements_json`）不同时导入报错。
- `question_aliases` 与 `question_alias_candidates`：状态 `matched` / `not_in_catalog` / `ambiguous`；首版旧题别名按 12 §2.3 负责人确认表写入；NFKC 规范化。
- `lib/db/schema.ts` 加表，`npm run db:generate` 生成**追加**迁移；`lib/db/initialize.ts` 不动。
- `scripts/import-questions.ts` 与 `npm run db:import-questions`：整次导入一个事务，失败整体回滚；校验目录与要求文件一一对应。
- 新文件 `data/question-bank/requirements.mock.json`：38 题逐题写 `subquestions`（英文原问 + 中文说明）、`layout`、`requiresOverallJudgement`（12 §2.2）。按题目原文认真拆分，不要套模板；对拿不准的题在报告里单独列出理由。负责人会逐题审阅。
- `lib/taxonomy.ts`，带 `taxonomyVersion`。
- 别名解析如需函数，放 `lib/rules/` 或 12 指定的位置，纯函数，配 `tests/` 下的 `node --test` 单元测试。

## 验收测试（必须有对应测试）

1. 重复导入结果相同（幂等）。
2. 同题 v2 导入后 v1 保留、当前版本切换到 v2。
3. 缺一条要求记录时导入失败且整体回滚（数据库无部分写入）。
4. 同 `(id, version)` 内容不同（包括只有 requirements 不同）时导入报错。
5. 别名四种解析结果：matched、not_in_catalog、ambiguous、未登记。
6. NFKC 规范化（全角/半角、空白等）。
7. `test:db` 覆盖空库全量迁移与已有数据库升级。

## 文档没写清楚时

产品行为不清楚的，**不要自行决定**：在报告“疑问”一节写出问题、你的候选方案、你暂时采用的最保守做法。

## 完成后

1. 运行：`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`，以及一次 `npm run db:import-questions`（对临时库，不要碰 `data/app.db` 以外的真实数据；如脚本默认写 `DATABASE_PATH`，用临时路径运行）。
2. 写报告 `docs/plans/reports/WP1.md`：改了哪些文件；每条验收测试对应哪个测试、是否通过；每条命令的结果摘要；未完成事项；疑问；`requirements.mock.json` 中拿不准的题。
3. 最后一条消息用三五行概括结果。
