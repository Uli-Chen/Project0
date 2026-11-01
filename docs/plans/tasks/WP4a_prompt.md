你是本项目“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人是 Claude Code。WP1～WP3 已验收提交（最新 e4ce806）。现在开始 **WP4a 卡片与写成作文（QK-01、QK-02、QK-03、QK-07）**。本包不调用模型；追问、检查与额度在 WP4b，速刷界面在 WP5。

## 工作环境与测试分工

- 仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。**不要提交、不要切分支、不要 push。** 不联网，不加新依赖，不调用真实模型（启动任何进程时 `LLM_API_KEY` 置空）。不得打开或修改 `data/app.db`，不修改 `.claude/`。
- **全部测试由你完成**，含端到端（临时库；沙箱不能监听端口时用进程内路由与页面渲染），证据放 `docs/plans/reports/WP4a_e2e/`。

## 先读

1. `AGENTS.md`；改路由、页面前读 `node_modules/next/dist/docs/` 中相关指南。
2. 开发方案 `docs/plans/2026-11-01_question_bank_dev_plan.md` 第 3、6、7 节与第 4 节 WP4a。
3. RFC `docs/designs/question_bank_first_practice.md` §3、§4 全文、§5（Quick 完成只在检查通过时，本包不写）、§10 验收表中 “Passed card edited”“Directly typed card; selected user excerpt”“Quick Sunday, continued Deep Monday” 三行。
4. `原型/13_速刷与主题卡片.md` §1、§2、§3、§4、§7、§10、§11；`原型/12_题库与推荐.md` §2.2（`QuestionRequirements`）、§3（`default_continuations`）；`原型/90_共享规范.md` §4.1（规则、开关）。
5. 之前各包报告末尾的负责人验收记录，尤其 WP2a（`cardSnapshot` 由本包定义）、WP2c（创建、删除集中函数 `deletePracticeContent`、`lastStudentActionAt`）、WP3 报告的接口。
6. 现有代码：`app/api/sessions/route.ts`、`app/api/sessions/[id]/actions/route.ts`、`lib/db/create-practice.ts`、`lib/db/queries/sessions.ts`、`lib/pipeline/read-session.ts`、`lib/pipeline/http.ts`、`lib/rules/student-action.ts`、`lib/db/request-receipts.ts`、`lib/db/practice-facts.ts`、`components/essay/session-view.tsx`、`components/essay/readonly-session.tsx`、写前 / 写作阶段左栏组件、`data/question-bank/requirements.mock.json`。

## WP4a 范围

1. **表**（schema + 追加迁移）：`topic_cards`、`quick_check_results`、`quick_operations`、`quick_operation_inputs`、`quick_packages`，列与“删除练习时”语义按 13 §3。本包只有 `topic_cards` 有业务写入，其余四张建表并纳入删除 / 账户删除测试。
2. **布局** `lib/quick/layouts.ts`：五种 `layout` 的槽位，槽位按本题 `subquestions` 生成（不是题型模板）。纯函数 `cardSlots(requirements)`；对 38 道题全部生成并测试每题槽位与其 `subquestions` 对应。
3. **卡片结构** `lib/quick/schemas.ts`：`CardContent`、`Part`、`Provenance`（13 §2）及各动作请求的 Zod schema。
4. **创建速刷**：`POST /api/sessions` 的 `questionId` 请求体允许 `activity = "quick"`（仅 `mode = practice`），条件是 `QUICK_ENABLED` 有效（依赖题库开关）；关闭时返回 403 `feature_disabled`。同一事务创建 `activity = quick`、`stage = quick` 的会话与 `content_version = 0`、`state = draft`、空 `parts` 的卡片；其余沿用 WP2c（快照、回执、marker、`lastStudentActionAt`）。
5. **支持判断**：`QUICK_ENABLED` 有效时 `activity = quick` 且 `stage = quick` 的会话对速刷动作与 `GET .../quick` 是“支持的”；对精练动作与草稿 `PATCH` 仍 409 `unsupported_session`。`QUICK_ENABLED` 关闭时已有速刷全部只读（90 开关表）。页面仍用只读视图显示速刷（速刷界面在 WP5），但只读视图要能显示卡片内容。
6. **不调模型的动作**（`POST /api/sessions/{id}/actions`，按 `activity` 分派到 `lib/pipeline/quick.ts`），全部在同步短事务 `commitQuickMutation` 内：重读会话与卡片、校验所有者与版本、修改、`version + 1`、写 `request_receipts`（若带键）与 `completedRequests`、写 `lastStudentActionAt`；事务后路由不再 `persist`。
   - `cardSave { cardVersion, parts: [{ key, text }] }`：版本不等 → 409 `card_conflict`；`key` 必须属于本题槽位；`text` 去首尾空白后 1～600 字，空串表示清空该槽位；实际改动的槽位写 `direct` 来源（服务端生成 `editId`、`editedAt`、新 `contentVersion`）；未改动的槽位保留原来源；`content_version + 1`；`passed → unchecked`；无任何实际改动时不加版本、幂等返回。
   - `cardExcerpt { cardVersion, key, messageId, start, end }`：消息必须属于本会话、`role = user`、由本用户发出；`start`/`end` 是 JS 字符串下标（UTF-16），不得切开代理对；文字由服务端截取并校验 1～600 字；写 `excerpt` 来源；版本规则同上。
   - `quickAnswer { text }`：学生回答，存为本会话 `role = user` 的消息（带服务端 `messageId`），记录写入时已发生的追问数；只有存在尚未回答的教练追问时才允许（本包测试用夹具注入一条教练追问消息）。
   - `afterFollowUp`：写入槽位时会话中已发生的教练追问次数（0/1/2）。
7. **`continueDeep`**（13 §7）：`{ explicitNew: false }` 查 `default_continuations`——已有且存在 → 返回子练习；已删除或子练习 `lifecycle = closed` 且未完成（视为放弃）→ 409 `default_child_gone`；没有 → 同一事务创建精练会话（`activity = deep`、`mode = practice`、同一题目快照、`continuedFromQuickId`、`cardSnapshot`）并写映射。`{ explicitNew: true, idempotencyKey }` 按回执去重，创建另一次练习，复制当前卡片快照，不改映射。卡片为空（无任何 part）也允许写成作文。
8. **`cardSnapshot` 结构**（WP2a 留给本包）：`{ cardId, contentVersion, content: CardContent, state, lastCheckedVersion, snapshotAt }`，冻结，之后改原卡片不影响。精练会话的写前与写作阶段，在左栏只读显示 `cardSnapshot`（沿用现有组件与设计变量）；无快照时界面不变。
9. **`GET /api/sessions/{id}/quick`** 返回 `{ session, card, operations, budget }`；本包 `operations = []`，`budget = null`（WP4b 填）。
10. **删除**：`deletePracticeContent` 加入 `topic_cards`、`quick_check_results`、`quick_operation_inputs`（若靠外键级联，也要在测试中证明已删除）；`quick_operations`、`quick_packages`、`default_continuations` 保留。

## 负责人已定的细节

- 卡片只能由学生输入或学生原话摘取产生，任何模型输出不得写入 `Part`（G-11）；本包无模型调用，但要有一条测试证明摘取教练消息被拒。
- 编辑一段 `excerpt` 来源的文字后，该槽位来源改为 `direct`。
- 精练动作与速刷动作按会话 `activity` 分派；速刷会话收到精练动作 409 `unsupported_session`，反之亦然。

## 验收测试（测试名写出情境）

1. `cardSave` 版本冲突 409，卡片不变。
2. 摘取教练消息 / 别的用户的消息 / 越界位置 / 切开代理对 → 拒绝。
3. RFC §10 “Directly typed card; selected user excerpt”：直接输入与摘取各自来源正确；编辑摘取后变 `direct`。
4. RFC §10 “Passed card edited”：把卡片置为 `passed`（夹具），再保存 → `unchecked`，同一 `cardId`，完成事件不变。
5. 默认子练习唯一：重复点击、换请求 ID、并发两次 → 同一子练习；子练习删除后 409 `default_child_gone`；`explicitNew` 按幂等键去重且不改映射。
6. 源卡片修改不影响子练习的 `cardSnapshot`。
7. RFC §10 “Quick Sunday, continued Deep Monday”：可控时钟下周日速刷、周一写成作文，两个会话各自独立，子练习的完成只在其自身反馈合同满足时产生（用 WP2b 已有路径与假模型验证一条完成事件归属精练）。
8. 38 题槽位与 `subquestions` 一一对应；原因与对策题有两组槽位。
9. 开关：`QUICK_ENABLED` 关时创建 403、已有速刷只读且所有速刷动作 409；开时正常。
10. 删除速刷后卡片等正文表为空、保留表仍在；账户删除后全部为空。
11. 原有测试全部通过；调整原有断言须逐条说明原因。
12. 端到端（临时库，开关打开）：按题目创建速刷 → 保存卡片 → 注入追问 → 回答 → 摘取 → 写成作文（默认）→ 再点一次（同一篇）→ 另开一次 → 改源卡片 → 打开子练习页面，左栏显示冻结快照；每步接口结果与数据库状态，及页面 HTML。

## 文档没写清楚时

不自行决定产品行为：在报告“疑问”一节写出问题、候选方案、暂时采用的最保守做法。

## 完成后

1. 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
2. 写报告 `docs/plans/reports/WP4a.md`：改动文件；每条验收测试对应的测试与结果；端到端证据路径；命令结果摘要；原有测试调整及原因；未完成事项；疑问。
3. 最后一条消息用三五行概括结果。
