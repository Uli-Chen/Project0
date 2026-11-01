# 开发方案：题库改版（0.4）

* **负责人（方案、建议、验收）：** Claude Code
* **实现者：** Codex gpt-6-astra
* **日期：** 2026-11-01
* **状态：** v4 已确认（三轮审阅：[r1](reviews/plan_review_r1.md)、[r2](reviews/plan_review_r2.md)、[r3](reviews/plan_review_r3.md)）；WP1～WP8 已完成；2026-11-01 部署到 project0.auglearn.org，题库/速刷/检查点已逐项启用，FOCUS 保持关闭（详见 reports/WP8.md）

## 0. 依据与范围

开发依据（冲突时按此顺序优先）：

1. [RFC](../designs/question_bank_first_practice.md)（2026-11-01 修订版）：**唯一的行为依据**。
2. 实现指南：[原型/12_题库与推荐.md](../../原型/12_题库与推荐.md)、[原型/13_速刷与主题卡片.md](../../原型/13_速刷与主题卡片.md)：表结构、接口、函数签名、文件位置。
3. [原型/90_共享规范.md](../../原型/90_共享规范.md) 第 4.1 节：会话 JSON 字段、读写规则、功能开关、`llm_calls`。
4. [原型/91_前端布局.md](../../原型/91_前端布局.md) 第 5 节：页面位置。
5. [原型/99_实现清单.md](../../原型/99_实现清单.md) “题库改版”部分：条目编号（QB / QK / RC / CP / RL）。
6. 题库：`data/question-bank/`（38 题 mock 目录，**冻结，不得修改**）。

**范围**：00 §9.1 的 N0～N3，加上线检查（RL-01、RL-02）。
**不在范围**：写作重点（`FOCUS_ENABLED` 保持关闭，诊断的分类表契约另立工作包）；正式题库内容校审（D-07）；部署与试用（N4）；评分与诊断（06）的任何改动。

## 1. 分工与流程

| 角色 | 职责 |
|---|---|
| 负责人 | 写方案；回答实现中的问题；审阅 `requirements.mock.json` 的每道题；每个工作包结束时审阅改动、运行检查、按验收用例验收 |
| 实现者 | 审阅本方案并提出异议；按工作包实现；每个工作包附自测结果与未完成事项；文档没写清楚的产品行为先提问，不自行决定 |
| 创始人 | 产品决定；批准提交与合并 |

每个工作包的循环：

1. 负责人发出工作包（本方案的一节 + 99 条目编号）。
2. 实现者在分支 `question-bank-0.4` 上实现，运行第 6 节的检查，写报告到 `docs/plans/reports/WPn.md`：改了哪些文件、哪些用例通过、还有什么没做或有疑问。**实现者不提交（commit）**。
3. 负责人验收（第 7 节）。不通过时写出必须修改的点，实现者修正后再验收。
4. 通过后由负责人提交（提交说明写 99 条目编号），并在 99 打勾、补提交号。

依赖它的工作包，要等它验收通过才开始。

## 2. 开工前提

- **W0-1 基线提交**（负责人，需创始人批准）：当前约 110 个未提交文件（已实现的登录、作文页等，以及本轮文档、RFC、题库目录）。在新分支 `question-bank-0.4` 上提交为起点。不在 `main` 上开发。
- **W0-2 基线检查**（2026-11-01 已运行，全部通过）：`npm run lint`、`npm run typecheck`、`npm test`（17 项）、`npm run test:ui`（5 项）、`npm run test:db`。W0-1 后补跑 `npm run build`。
- **W0-3**：本方案经实现者审阅达成一致。

## 3. 实现约定（所有工作包）

1. **先读** `AGENTS.md`：本项目的 Next.js 版本有破坏性变化，写路由、页面、服务端代码前先读 `node_modules/next/dist/docs/` 中的相关指南。
2. **代码风格**沿用现有代码：紧凑风格；Zod 校验入参与模型输出；用户 ID 只从认证 Cookie 取；写操作 `assertSameOrigin`；他人资源返回 404。
3. **新表只走追加迁移**：写进 `lib/db/schema.ts`，`npm run db:generate` 生成迁移；`lib/db/initialize.ts` 保持第一版基线不动（README）。`scripts/test-db.ts` 覆盖空库全量迁移、已有数据库升级、所有者隔离、级联与“删除练习后保留的记录”。
4. **规则函数**放 `lib/rules/`：纯函数，当前时间作为参数传入；每个函数有 `tests/` 下的 `node --test` 单元测试。
5. **模型调用在事务之外**；事务只包住 RFC §9 第 4 条列出的不变量。精练沿用 `lib/pipeline/lock.ts`；新的调模型动作用“加锁预留 → 解锁调用 → 加锁提交”（13 §4）。
6. **不加新依赖**；确有必要时先在报告里说明，等负责人同意。
7. **不改评分与诊断的输入**（G-01）；允许调整评估的编排与保存边界（12 §4）。不改 `data/question-bank/` 下任何已有文件。
8. **不批量改写旧会话**，不编造时间（90 §4.1）。
9. 新功能全部在功能开关后面，开关默认关闭（90 §4.1 开关表：`QUESTION_BANK_ENABLED`、`QUICK_ENABLED`、`CHECKPOINTS_ENABLED`、`FOCUS_ENABLED`）。完成事件、曝光记录与迁移扫描不受开关控制。
10. 界面文字用简体中文，沿用现有组件与设计变量（91 §7）。

## 4. 工作包

依赖：WP1 → WP2a → WP2b → WP2c → WP3 → WP4a → WP4b → WP5；WP6 依赖 WP2c，可与 WP4、WP5 交替；WP7 依赖 WP6；WP8 最后。

### WP1 题库目录、每题要求、别名与分类表（QB-01、QB-02、QB-03、QB-09）

- `questions` 表：主键 `(id, version)`；`is_current` 与当前版本 `bank_order` 用部分唯一索引；同一 `(id, version)` 内容不同时导入报错（12 §2.1）。
- `question_aliases` 与 `question_alias_candidates`：`matched` / `not_in_catalog` / `ambiguous`；首版 7 条旧题别名按 12 §2.3 的负责人确认表写入。
- `scripts/import-questions.ts` 与 `npm run db:import-questions`：整次导入在一个事务内，失败整体回滚。
- **`data/question-bank/requirements.mock.json`**（新文件）：38 题逐题写 `subquestions`（英文原问 + 中文说明）、`layout`、`requiresOverallJudgement`（12 §2.2）。负责人逐题审阅通过后才导入。
- `lib/taxonomy.ts`，带 `taxonomyVersion`。

验收测试：重复导入结果相同；同题 v2 导入后 v1 保留、当前版本切换；缺一条要求记录导入失败且整体回滚；别名四种解析结果；NFKC 规范化。

### WP2a 兼容读取与只读外壳（QB-04、QB-12）

- `SessionState` 新字段（90 §4.1）；`Stage` 加 `quick`；`readSession` 补默认值、保留未知字段，`listSessions`、`getSession` 全部经过它。
- 页面在进入 `SessionProvider` 前按 `activity` / `stage` 分派；不支持的会话只读；草稿 `PATCH` 与动作返回 `409 unsupported_session`。
- 功能开关 `lib/config/features.ts`。

验收测试：旧 JSON 往返后未知字段仍在；`activity = quick` 的会话在 WP4 之前只读、动作与 PATCH 均 409；浏览器打开已有作文，内容与操作和改动前相同。

### WP2b 迁移扫描、提交标记与完成事件（QB-05、QB-06、QB-07）

- 表：`attempt_markers`、`completion_events`、`familiarity`、`legacy_scan`、`default_continuations`、`request_receipts`（12 §3，13 §3）。
- 原稿接受时（`engine.ts:46` 附近）短事务：`originalSubmittedAt`、新原稿资格竞争（12 §4）。
- 评估编排：第一次调用成功即写 `evaluation`、`stage = feedback` 与完成事件；提纲回顾改为可选的 `reviewStatus` 与单独重试（12 §4）。
- 迁移扫描 `scripts/migrate-0.4.ts`，启动时对未扫描用户执行一次；不改写会话，不编造时间（12 §7）。

验收测试：12 §9 用例 1、1b～1e、2、5；RFC §10 “Required feedback saved; optional review fails…”“Free-entry repeat…”“Old finished record saved or regraded…”；`tests/agent.test.ts`、`learning-flow.test.ts` 继续通过。

### WP2c 创建、生命周期与删除（QB-08、QB-11）

- `POST /api/sessions`：`{ questionId, activity, mode, idempotencyKey, rewriteOfDeepId? }`，冻结题目快照，经 `request_receipts` 去重；粘贴题目经 `resolveQuestion`。
- `POST /api/sessions/{id}/lifecycle`。
- 删除练习：会话、卡片、检查结果、操作输入删除；标记与事件保留；账户删除全部清除。
- `QUESTION_BANK_ENABLED` 打开时停用旧的自动重点注入（`app/api/sessions/route.ts:17-19`）。
- 删除 `finish` 的 `planChange`；“下一步”改为链接到该题所在主题页（无题目时到首页）。

验收测试：同一 `idempotencyKey` 只建一个会话；参数不同返回 409；删除练习后家族曝光仍在；账户删除后所有相关表为空。

### WP3 模型调用：预留、限额与日志（QB-10）

先定接口，再实现，WP4 直接使用：

```ts
reserveCall({ userId, operationId, packageId, limits }) -> Reservation   // 写库失败则抛错，不得调用
generateJson(instruction, context, schema, options?)                      // options 见下
settleCall(reservation, { usage | null, latencyMs, outcome })            // 失败时保留预留
```

- `options = { purpose, userId, sessionId, operationId?, reservation?, maxInputTokens?, maxOutputTokens?, timeoutMs?, retries? }`；不传时保持现有行为（16,000 / 约 120 秒 / 2 次尝试）。
- 输入估算：从 `lib/llm/client.ts` 抽出 `buildMessages`，对实际发送的完整消息（系统提示、Schema、上下文、重试提示）按 UTF-8 字节数加版本化的协议余量估算，标为“保守准入估算”。超限拒绝并保留内容。
- 每次 provider 尝试写一行 `llm_calls`；普通观测日志写失败不影响调用。速刷的预留失败必须阻止调用。

验收测试：可控时钟与延迟假 fetch；覆盖成功、超时、不合格输出、usage 未知、核销失败、响应丢失；两个卡片同时预留而用户只剩一次额度时只有一个成功；行里没有正文；不传 options 时行为不变。

### WP4a 卡片与写成作文（QK-01、QK-02、QK-03、QK-07）

- 表：`topic_cards`、`quick_check_results`、`quick_operations`、`quick_operation_inputs`、`quick_packages`（13 §3）。
- 布局与 `Part` 来源（13 §2）；`cardSave`、`cardExcerpt`、`quickAnswer`、`continueDeep`，全部经 `commitQuickMutation`（13 §4）。
- `GET /api/sessions/{id}/quick`。

验收测试：版本冲突 409；摘取教练或别人的消息被拒；默认子练习唯一、重复点击返回同一篇、明确另开按幂等键去重、源卡片修改不影响快照；RFC §10 “Passed card edited”“Directly typed card; selected user excerpt”“Quick Sunday, continued Deep Monday”。

### WP4b 额度、追问、检查与恢复（QK-04、QK-05、QK-06、QK-08）

- 初始包、补充包、用户 24 小时总额（RFC §8）；三段式锁；`quick_followup`、`quick_check`；`stale` 判定；启动恢复读取冻结输入。

验收测试：13 §11 用例 1～7；RFC §10 “Budget exhaustion, crash…”“Later edited card after initial checks used”“Delete a Quick with consumed quota…”。

### WP5 速刷界面与复习页（QK-09、QK-10）

- 作文页最外层按 `activity` 分派到两套组件；速刷布局 91 §5.3；速刷用自己的客户端状态控制器。
- `components/quick/*`；精练左栏显示 `cardSnapshot`；`/cards`（13 §9；只呈现现存卡片内容，不另建材料库）。

验收：负责人在浏览器走完：开始速刷 → 追问 → 摘取 → 检查未通过 → 修改 → 复检通过 → 写成作文 → 再点一次打开同一篇；检查进行中保存新版本得到 `stale`；窄窗口与深色模式；教练行为用例 16～20 人工判断。

### WP6 推荐、计数与页面（RC-01～RC-05、CP-04）

- `lib/rules/recommend.ts`（12 §5.1），注释写出对应 RFC 条款；`lib/rules/practice.ts` 组装输入与计数（每周、主题，只读完成事件；旧的无日期记录单独计数）。
- `GET /api/topics`、`GET /api/topics/{topic}`。
- 首页主题入口、主题页、导航；作文库 `app/(main)/essays/page.tsx`，作文页保留 `app/essays/[id]/page.tsx`，保留 `/sessions/[id]` 重定向；替换 `lib/learning/summary.ts` 按 `createdAt` 计周的逻辑。

验收测试：RFC §10 推荐相关行；12 §9 用例 3、4、7、8、9；浏览器中开关关闭时首页不变，打开后为主题入口。

### WP7 检查点（CP-01、CP-02、CP-03、CP-05）

- `checkpoints` 表、`checkpointState`、开始与跳过接口、服务端截止、完成复核、基线；所有创建入口共用家族占用检查；拒绝开始时也保存外部练习自报；关闭或删除释放占位（12 §6）。
- 进展页基线与趋势只用合格检查点。

验收测试：RFC §10 检查点相关行（含两个标签页、刷新、超时提交、删除后再试）。

### WP8 上线检查（RL-01、RL-02）

- 开关全关时：旧功能正常，旧练习能打开，`npm run check` 通过。
- RFC §9 列出的上线检查逐条演练；只读回滚：在 WP2a 完成后的提交上运行，打开 WP4 之后产生的数据，确认只读、动作与 PATCH 均 409、无作文按钮、新表还在。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 推理模型的思考计入输出 token，512 / 768 可能不够，检查经常判为不合格输出 | WP4 完成后用 3 道题实测，结果记入 00 §11 D-08；若不够，报告中给出数据，由创始人决定是否调整 RFC §8 |
| 表与事务数量多，`test:db` 变慢或不稳定 | 每张表的测试独立建库；不依赖执行顺序 |
| 速刷界面塞进作文页导致组件分支过多 | 最外层分派两套组件 |
| 作文库路由移动影响现有链接与测试 | 旧链接重定向；`tests/ui` 同步更新 |
| mock 题被当成官方真题 | 题目详情显示“练习题（非官方真题）” |
| `requirements.mock.json` 写错导致检查标准错误 | 负责人逐题审阅后才导入；导入脚本校验一一对应 |

## 6. 每个工作包的自测（实现者运行）

除下列命令外，有界面或启动流程的工作包，实现者还要在临时数据库上做端到端验证（启动开发服务器或进程内执行路由与页面渲染），不调用真实模型，结果与截图／日志写进报告。

```text
npm run lint
npm run typecheck
npm test
npm run test:ui
npm run test:db
```

WP8 另外运行 `npm run check`（含 build）。报告中贴出每条命令的结果摘要。

## 7. 验收（负责人执行）

1. 阅读全部改动，对照 RFC、12、13 与 99 条目；逐条检查第 3 节约定。
2. 自己重跑第 6 节的命令。
3. 按对应用例逐条核对实现者提交的测试证据（测试名、日志、截图）。**全部测试由实现者完成**，包括有界面工作包的浏览器／端到端验证（创始人 2026-11-01 定）；负责人只审阅证据、必要时重跑第 6 节命令。
4. 结论三选一：通过；修改后通过（列出必须修改的点）；不通过（说明原因）。
5. 通过后提交，并在 99 打勾补提交号。

## 8. 第一轮审阅的处置

实现者结论：READY WITH CHANGES。负责人已核对代码，全部阻塞项属实并采纳：

| 实现者意见 | 处置 |
|---|---|
| 第一次评估调用已含分数与问题反馈，第二次只是提纲回顾 | 采纳。完成点改为第一次调用成功后；回顾改为可选 `reviewStatus`（12 §4，WP2b） |
| `bank_order` 全表唯一与多版本冲突 | 采纳。改为当前版本部分唯一；同版本不同内容报错（12 §2.1） |
| 两个旧内置 ID 在目录中没有对应题；别名表无法表达歧义 | 采纳。负责人核对目录后确认：两道远程办公题 → `qb_mock_work_002` 家族；其余 5 道 `not_in_catalog`；新增歧义状态与候选表（12 §2.3） |
| README 禁止把新表写进初始化函数 | 采纳。新表只走追加迁移（第 3 节第 3 条，12 §3，13 §3，90 §4.1 第 6 条） |
| 新原稿判定应在原稿接受时竞争，并区分“没提交过”和“提交过但时间不明” | 采纳（12 §3 `familiarity`、§4） |
| 现有锁持锁等模型、拒绝并发，无法支持检查中保存新版本 | 采纳。三段式锁、`commitQuickMutation`、持久化请求回执（13 §4） |
| 恢复需要冻结的操作输入；预留失败必须阻止调用 | 采纳（`quick_operation_inputs`，13 §5、§8，WP3 接口） |
| 开关不完整；只读分派要在 `SessionProvider` 之前；旧重点注入要停用 | 采纳（90 §4.1 开关表与第 7 条，WP2a、WP2c） |
| WP2、WP4 过大；WP3 先定预留接口；计数提前到 WP6 | 采纳（第 4 节） |
| 非阻塞建议 5 条 | 全部采纳，已写入对应工作包的验收测试 |

实现者在“WP1 前请明确”中提的 4 个问题都属于技术决定，由负责人决定为：1 是；2 是（别名见 12 §2.3）；3 是；4 是。

### 第二轮审阅的处置

结论 READY WITH CHANGES；3 个阻塞项与 3 条备注全部采纳：

| 意见 | 处置 |
|---|---|
| 新原稿判定漏掉已有反馈；提交事实只在 fresh 分支保存 | 按“读取 → 计算 → 无条件保存 → 按练习保存资格”四步（12 §4），补用例 1d、1e |
| 没有完成事件的旧会话可能永远拿不到首次完成 | “不新建事件”只限已有事件的会话；补用例 1c |
| 题库开、速刷关时推荐指向被禁动作；上线顺序矛盾 | 推荐输入加 `quickEnabled`，关闭时退化为精练，只读速刷不进继续入口；上线顺序改为 题库与推荐 → 速刷 → 检查点（12 §5.1，90 §4.1，99 RL-03）；补用例 8、9 |
| `seq` 的分配依据 | 服务端在预留事务里分配（13 §3） |
| 跨卡片并发预留测试 | 加入 WP3 验收 |
| 冻结比较包含 `requirements_json` | 已写入 12 §2.1 |

### 第三轮确认

结论：第二轮各项已解决，无新增阻塞项，WP1 可在 W0 满足后开始（[r3](reviews/plan_review_r3.md)）。剩余一条：追问去重不能按卡片版本，否则回答追问后无法发起第二次追问。已修订为按服务端确认的追问轮次（`followup:1` / `followup:2`）去重，检查按卡片版本（13 §3）。

**负责人结论：方案达成一致，状态改为“已确认”。**

## 9. 请实现者确认

1. 第 8 节的处置是否完整、准确？
2. 修订后的 RFC、12、13、90、本方案之间还有没有矛盾或无法照写实现的地方？请逐条给出位置。
3. 如果没有阻塞项，请回复 READY，WP1 即可开始。
