# WP4a 卡片与写成作文（QK-01、QK-02、QK-03、QK-07）

完成日期：2026-11-01。分支 `question-bank-0.4`，基于已验收的 WP1～WP3；未提交、未切分支、未 push。实现及本包验收测试完成，等待负责人验收。

没有联网、安装依赖、调用真实模型，没有打开或修改 `data/app.db`、`.claude/` 或冻结题库。检查命令使用空 `LLM_API_KEY` 与临时 `DATABASE_PATH`；数据库测试、并发 worker、页面渲染及端到端均使用临时库。仅精练完成合同测试在安装假 fetch 后设置假凭证，并在 finally 恢复；速刷实现没有模型调用。保留原先未跟踪的 `docs/plans/tasks/WP4a_prompt.md`，未修改它。

## 实现与接口

### 表与迁移

`npm run db:generate` 生成追加迁移 `0004_noisy_firedrake.sql` 及对应 snapshot/journal；`initialize.ts` 未修改。

- `topic_cards`：唯一 `(user_id, attempt_id)`；卡片状态与版本有 CHECK；保存时递增 `content_version`，同一卡片不会因编辑换 ID。
- `topic_cards`、`quick_check_results`、`quick_operation_inputs` 用 `(user_id, attempt_id)` 复合外键引用 `writing_sessions` 并级联。集中删除函数 `deletePracticeContent` 删除会话时同时删除这些正文；增加注释并以非空数据验证级联。已有另一用户时跨所有者绑定也被数据库拒绝。
- `quick_operations`、`quick_packages` 只外键到 `users`，删除练习保留，账户删除清除。`default_continuations` 保持原有保留语义。操作的逻辑唯一索引为 `(user_id, attempt_id, kind, slot)`。
- 本包业务只写 `topic_cards`；其余四张表仅在测试夹具中写入。生产代码不创建追问、检查、额度包，也不写 Quick 完成事件。

### 卡片与动作

`cardSlots(requirements)` 返回扁平槽位 `{ key, requirementKey, en, zh, label }[]`。组数与顺序完全来自本题的 `subquestions`，key 为 `${subquestion.key}.${field}`。五种布局字段在 `lib/quick/layouts.ts`；原因/措施、双方/意见、双问题均保留各自要求，绝不从题型推断问题。读槽位时查卡片保存的题目 ID/version；目录发布 v2 不会改变 v1 卡片的槽位。

`CardContent`、`Part`、`Provenance`、`CardSnapshot` 及四个请求 schema 由 `lib/quick/schemas.ts` 定义。来源仅由服务端生成；请求不能注入作者、editId、来源、追问次数等字段。

`POST /api/sessions` 保留原请求结构；当有效 `QUICK_ENABLED=true` 且 `mode=practice` 时创建速刷。会话、空卡片（版本 0 / draft）、题目快照、marker、学生时间、回执同事务提交。速刷不会带入精练的开场消息。关闭开关返回 `403 feature_disabled`；mock 仍由检查点入口处理。

`POST /api/sessions/{id}/actions` 在读取/解析具体动作前先判断该会话是否支持；然后按 activity 分派。Quick 直接返回 `commitQuickMutation` 的结果，不进入精练锁、模型 admission 或后续 persist；Deep 收到任何已命名的速刷动作返回 `409 unsupported_session`，反向同理。草稿 PATCH 继续拒绝速刷。

`commitQuickMutation(userId, id, action, now?)` 是同步 `IMMEDIATE` 事务：重读本人会话和卡片 → 检查支持状态/回执/版本/来源 → 修改卡片或创建子练习 → 更新源会话版本/学生时间 → 写 completedRequests 与回执。源会话只做 UPDATE，不使用 upsert，删除后晚到请求不能复活它。`now` 为服务端内部参数；HTTP 请求不能指定时间。

- `cardSave`：只更新请求提供的槽位；trim 后空串删除对应 part。改动的非空槽位写 direct 来源，保留未改文字的原来源；每次有效保存仅递增一次卡片版本和会话版本。`passed → unchecked`，保留上次检查 ID/版本与完成事件。版本不一致在任何修改前返回 `409 card_conflict`。
- `cardExcerpt`：只接受本会话内、明确属于当前用户的 user 消息；由服务端截取，拒绝越界、倒序、空片段或切开 UTF-16 代理对，验证 1～600 字。文字与 offsets 对应的原文完全一致。后续编辑摘取文字会改为 direct。
- `quickAnswer`：只在最近一条已发生的追问尚未被回答时接受，保存服务端 UUID、userId、`afterFollowUp` 与 `replyToMessageId`；不自动写卡片。同键重放不重复添加回答。
- 实际写入 part 时按已发生的教练追问记录数写 `afterFollowUp=0/1/2`。新 quick 消息契约见下方“疑问”。
- 同一请求键不同参数、动作或源会话返回 `409 idempotency_conflict`。`requestId` 与 `idempotencyKey` 均可作回执键；同时提供时都绑定同一结果。已有键搭配新 requestId 重放，会补登记新键及 completedRequests，防止随后挪作另一个动作。无正文变化或同键重放不增加卡片/会话版本，不刷新学生时间。

### 写成作文与返回结构

`continueDeep { explicitNew: false }` 在事务内检查唯一默认映射；有可用子练习即返回原子练习，无映射才创建。已删除、或 closed 且没有完成事件的默认子练习返回 `409 default_child_gone`；closed 且已有完成事件仍可打开（含日期未知的历史完成事件）。

`explicitNew: true` 必须提供 `idempotencyKey`；复制当前卡片并创建另一篇精练，重复请求返回该篇，不改默认映射。空卡片允许继续。子练习始终为 deep/practice，保留原题快照，写入 `continuedFromQuickId` 与以下结构：

```ts
{
  cardId, contentVersion,
  content: CardContent, // 含每个 Part 的真实来源与 afterFollowUp
  state, lastCheckedVersion, snapshotAt
}
```

该快照深复制后写入子练习 JSON，源卡片修改/删除不影响它。精练写前与写作的现有左栏/抽屉内只读显示快照；无快照时原界面输出不变。速刷页面仍分派到 `ReadonlySession`，读取并展示卡片文字与来源类型，未引入 WP5 编辑界面。

四个动作及 `GET /api/sessions/{id}/quick` 的基本响应为 `{ session, card, operations: [], budget: null }`。`card` 为表的 camelCase 元数据加解析后的 `content`，不返回重复的 `contentJson`。`continueDeep` 额外返回 `deepSession`；`session` 始终指源 Quick，避免同一字段在不同动作中切换活动。GET 采用读取事务以获得一致会话/卡片，无更新时间，返回 `Cache-Control: no-store`。

有效 QUICK 开关关闭时，GET quick 与所有速刷动作均返回 `409 unsupported_session`；普通会话读取/页面仍可展示保存的卡片。题库开关关闭会使 QUICK 同时无效。

## 改动文件

| 文件 | 内容 |
|---|---|
| `lib/db/schema.ts` | 五张表、复合外键、状态/版本约束、唯一键 |
| `drizzle/0004_noisy_firedrake.sql`、`drizzle/meta/0004_snapshot.json`、`drizzle/meta/_journal.json` | 生成的追加迁移 |
| `lib/quick/layouts.ts`、`lib/quick/schemas.ts` | 槽位纯函数、卡片/来源/快照/四个请求 schema |
| `lib/db/queries/cards.ts` | 所有者限定读取，读取冻结题目版本的 requirements |
| `lib/db/create-practice.ts` | Quick 创建与卡片写入，同 WP2c 事务 |
| `lib/db/queries/sessions.ts` | 集中删除边界的级联说明；保留原删除函数 |
| `lib/pipeline/quick.ts` | 四个同步动作、回执、默认子练习、冻结快照及读取 |
| `lib/pipeline/http.ts` | Quick 的开关/活动/阶段支持判断 |
| `app/api/sessions/[id]/actions/route.ts`、`app/api/sessions/[id]/quick/route.ts` | activity 分派、GET quick |
| `lib/pipeline/types.ts`、`lib/prototype/types.ts`、`lib/rules/student-action.ts` | 快照类型、Quick 消息元数据、学生动作类型 |
| `app/essays/[id]/page.tsx`、`components/essay/session-view.tsx`、`components/essay/readonly-session.tsx` | 读取并传递速刷卡片，保留只读分派 |
| `components/quick/card-readonly.tsx`、`components/essay/essay-screen.tsx` | 卡片只读展示、精练左栏快照 |
| `components/coach/coach-thread.tsx` | Stage 类型扩大后补“速刷”标签，既有阶段不变 |
| `tests/quick.test.ts`、`tests/ui/quick-card.test.ts` | 18 个后端专项情境、3 个 UI 情境 |
| `tests/helpers/quick-api.ts`、`quick-records.ts`、`quick-worker.ts` | 临时库真实认证路由、非业务写入夹具、双进程并发 |
| `tests/question-create-api.test.ts` | 两处旧速刷创建断言更新（下述） |
| `scripts/test-db.ts`、`scripts/test-quick-e2e.ts` | 升级/级联测试与端到端流程 |
| `docs/plans/reports/WP4a.md`、`WP4a_e2e/*` | 报告、渲染脚本、日志和数据库/HTML 证据 |

`app/api/sessions/route.ts` 的已有题库分支直接复用增强后的 createQuestionPractice，无需改路由外形。`read-session.ts` 保持未知字段往返与旧会话默认值逻辑；原有 `isSupportedSession` 仍用于精练编辑器/PATCH，Quick API 使用 `assertQuickSession`，避免把 Quick 送进 SessionProvider。评分与诊断、WP3 模型调用接口未改。

## 验收测试对应

以下全部通过。测试全名见 [targeted-tests.log](WP4a_e2e/targeted-tests.log)，后端全量见 [check-test.log](WP4a_e2e/check-test.log)。

| 验收 # | 情境与对应测试 | 结果 |
|---|---|---|
| 1 | `cardSave 版本冲突为 409 card_conflict，卡片、会话与所有回执完全不变` | 409；整库相关表前后相等 |
| 2 | `摘取教练、他人、别的会话、未知作者、越界或切开代理对均拒绝，正文不变` | 9 种拒绝输入；无写入，覆盖 G-11 |
| 3 | `Directly typed card; selected user excerpt…` | direct 元数据、exact excerpt offsets、编辑变 direct、未改来源保留，0/1/2 次追问上下文 |
| 4 | `Passed card edited…` | 同 cardId、unchecked、旧检查版本保留、完成事件不变 |
| 5 | `默认子练习唯一…`、`真实两进程 SQLite 并发…`、`默认子练习删除或 closed 未完成…` | 重复/并发唯一；丢失响应重放；明确另开去重且映射不变；删除与放弃拒绝；完成后关闭仍可开 |
| 6 | `源卡片修改与删除不改变精练的冻结 cardSnapshot…`、`原题版本冻结…` | 内容、来源、状态、版本均冻结；显式新练习复制新版本；旧卡使用 v1 要求 |
| 7 | `Quick Sunday, continued Deep Monday…` | 可控时钟周日 23:00 Taipei Quick 完成夹具、周一 00:30 Deep。Quick 保存本身无事件；Deep 评估失败无新增；WP2b 实际 evaluate 路由在假模型返回有效反馈后仅新增一个 Deep 事件；两条各在其周，Quick 历史事件不变 |
| 8 | `38 道题的每组槽位与本题 subquestions 一一对应…` | 38/38，五布局齐全，key 唯一，英文/中文要求原样对应；原因/对策两组 |
| 9 | `开关：速刷关闭与题库关闭…`、`活动分派、所有者隔离与 Same Origin…` | 创建 403、已有动作/GET quick/PATCH 409、恢复开关正常；他人 404、跨源 403；页面两种开关均只读显示卡片 |
| 10 | `删除速刷只删卡片…账户删除…`、`scripts/test-db.ts`、E2E | 三张正文表级联空；操作/包/默认映射保留；再建存活记录后真实账户删除路由清空本人所有相关表，另一用户记录保留 |
| 11 | 五项规定检查 | lint/typecheck 通过；132/132 后端、22/22 UI；DB 四组 PASS；原有测试只调整本报告列出的两处 |
| 12 | `scripts/test-quick-e2e.ts` | 14 次真实路由调用、2 次夹具步骤、5 次真实页面渲染，共 21 步带完整数据库证据 |

补充覆盖：600 Unicode 字符边界/601 拒绝、空串清空、部分更新/no-op、重复/非法槽位、待答追问门槛、请求键冲突/别名绑定、创建卡片失败与动作回执失败的整事务回滚、删除后晚到动作不复活、复合外键所有者隔离、GET/页面不改变学生时间、UI 转义 HTML。

## 端到端证据

命令：`LLM_API_KEY='' node --conditions=react-server --import tsx scripts/test-quick-e2e.ts`。临时目录 `opc-quick-*`，结束清理；进程内真实路由、Next request store 与真实 Cookie 认证，不监听端口。独立 SSR 子进程加载真实 EssayPage/SessionView/SessionProvider/EssayScreen 及现有 Router/Tooltip provider，没有替换业务组件。

流程：创建速刷 → 保存 → 夹具注入追问 → 回答 → 摘取 → 默认写成作文 → 换 ID 再点同一篇 → 明确另开 → 重放另开请求 → 修改源卡片 → GET 恢复 → 打开写前页 → 进入写作并打开写作页 → 开/关 QUICK 看只读速刷 → 夹具填入其余四张表 → 删除源 → 打开仍有冻结内容的子练习 → 新建存活速刷 → 账户删除。每个接口及夹具步骤记录数据库状态，页面渲染前后也比较数据库不变。

- [e2e.log](WP4a_e2e/e2e.log)、[summary.json](WP4a_e2e/summary.json)：21 步通过，5 次页面渲染，0 网络/真实模型调用，integrity_check=ok。
- [steps-and-database.json](WP4a_e2e/steps-and-database.json)：逐步 HTTP 状态/响应与会话、卡片、操作、输入、包、marker、完成、familiarity、映射、回执行。
- [deep-prewriting.html](WP4a_e2e/deep-prewriting.html)、[deep-writing.html](WP4a_e2e/deep-writing.html)：左栏保留“最初保存的原因”“回答里的原话”，没有后改的源卡片文字。
- [quick-enabled.html](WP4a_e2e/quick-enabled.html)、[quick-disabled.html](WP4a_e2e/quick-disabled.html)：显示最新源卡片，仅只读，无编辑器或作文动作按钮。
- [deep-source-deleted.html](WP4a_e2e/deep-source-deleted.html)：源删除后子练习快照仍在。各 HTML 对应 `*-render.json` 写明页面路径、stage、lifecycle、学生时间及渲染器。
- [render.mjs](WP4a_e2e/render.mjs)：可复现的认证页面渲染入口；拒绝非指定临时库目录及非空模型 key。

## 命令结果摘要

实际运行时为 Node v25.8.2（项目 engines 为 24.x），与前包相同。没有执行应用库迁移或部署。

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run db:generate` | exit 0，19 张表中新增 5 张，生成 0004 | 迁移 SQL 与 snapshot |
| `npm run lint` | exit 0，零 warning | [lint](WP4a_e2e/check-lint.log) |
| `npm run typecheck` | exit 0，Next typegen 与 tsc 通过 | [typecheck](WP4a_e2e/check-typecheck.log) |
| `npm test` | exit 0，132/132（原 114 + 本包 18） | [test](WP4a_e2e/check-test.log) |
| `npm run test:ui` | exit 0，22/22（原 19 + 本包 3） | [test:ui](WP4a_e2e/check-test-ui.log) |
| `npm run test:db` | exit 0，四组 PASS | [test:db](WP4a_e2e/check-test-db.log) |
| 专项 `tests/quick.test.ts` | exit 0，18/18，含真实双进程竞争 | [targeted-tests](WP4a_e2e/targeted-tests.log) |
| `scripts/test-quick-e2e.ts` | exit 0，完整流程与真实页面 SSR | [e2e](WP4a_e2e/e2e.log) |
| `git diff --check` | exit 0 | 无空白错误 |

开发中修正过测试令牌必须是 64 位 hex 的夹具问题、stage 枚举扩大后的标签类型检查，并由原测试发现/修复“先解析请求再拒绝不支持会话”导致的 400/409 顺序回归；未放宽原只读保护测试。日志为最终通过版本。

## 原有测试调整及原因

只改 `tests/question-create-api.test.ts` 中两处已有业务断言：

1. `same idempotencyKey concurrent/repeated creates…` 中，QUICK 未开启时把 activity 改成 quick，原期待 `409 unsupported_activity`，现在必须为 `403 feature_disabled`。其余改参数冲突及所有者隔离断言保持原样。
2. 原 `question-bank switch…quick/mock rejected regardless quick flag` 改为随开关判断：QUICK 开时 `201` 且 activity/stage 均为 quick，关时 `403 feature_disabled`。mock 仍是 `409 mock_requires_checkpoint`；题库总开关、旧入口 focus 行为未放宽。

`scripts/test-db.ts` 追加 WP3 → WP4a 中间迁移、五表非空夹具与级联断言；保留表清单由 7 增至 9。原空库/历史库/所有者/账户删除/晚到模型保存断言保留。其余已有 tests 文件未改。

## 疑问（候选方案与暂时采用的保守做法）

| 文档未完全规定的点 | 候选方案 | 本包暂用 |
|---|---|---|
| 五布局的具体槽位后缀 | 固定理由数/额外例子与反方；或每个 subquestion 的回答与解释，权衡题另列利弊 | 后者：position/both_views/problem_solution/two_questions 为 answer+why，weigh 为 advantages+disadvantages+answer+why。不新增额外作答要求或强制例子；全部组来自已审阅 subquestions。WP4b 不应把每个空槽机械当成不满足要求。 |
| cardSave 未提供的槽位 | 全量替换时清除；或部分更新时保留 | 保留，只有显式空串清空，避免不完整请求删除学生文字。 |
| “600 字”与摘取首尾空白 | UTF-16 长度、Unicode 字符数或字素簇；摘取 trim 或保留 | 以 Unicode code point 计 600（中文/英文各一、emoji 代理对算一）；索引仍严格 UTF-16。直接保存 trim；摘取保留选中原文全部空白但拒绝全空白，避免虚假引用。 |
| 无文本改动/重复打开是否刷新版本和时间 | 每次请求刷新；或仅实质改变时刷新 | 卡片和会话版本、学生时间均不刷新。若有新请求键，仅补回执/completedRequests；同键完整重放没有重复写入副作用。 |
| Quick 追问和作者元数据尚未定序列化字段 | 统计所有教练消息；或显式标识真实追问与回答关联 | 只数 `role=coach, stage=quick, action=quickFollowup` 的消息；回答保存 `role=user, stage=quick, action=quickAnswer, userId, afterFollowUp, replyToMessageId`。不把开场、检查结果当追问。WP4b 需沿用此契约；不为缺 userId 的历史消息推断作者，摘取时拒绝。 |
| continueDeep 统一响应中的子练习位置 | 将 session 替换成 Deep；或保留 Quick 并增加子字段 | 保留统一 Quick session/card，新增 deepSession，避免客户端拿 Deep 状态覆盖 Quick。 |
| 明确另开后的幂等键重放，而该新子练习已删除/放弃 | 自动再建；新错误码；沿用子练习不可用错误 | 沿用 `409 default_child_gone`，不重新创建，不覆盖默认映射。 |
| needs_development 编辑后的状态 | 也改 unchecked；或仅按本包明确要求处理 passed | 只做指定的 passed → unchecked，其他状态保持，检查版本仍保留；不扩展状态转移产品规则。 |

以上均没有引入新的完成条件、模型输出写卡、配额规则或页面操作。供负责人验收时确认；如需调整，优先沿用 RFC 与用户指令。

## 未完成事项与范围边界

WP4a 指定实现与测试无未完成项。追问生成/检查/重试/额度及 Quick 完成事件写入属于 WP4b；速刷可编辑界面属于 WP5，本包仍只读。WP3 验收中的模型配置读取复用备注仍留 WP4b，没有提前修改模型客户端。

验收方式是经授权的进程内真实接口与页面 SSR，未声称完成浏览器交互、截图或模型质量检验。未运行 build（本包要求五项检查；WP8 另含 build），也未另换 Node 24 运行。无提交或部署动作。

## 负责人验收（2026-11-01，Claude Code）

**结论：通过。**

1. 代码审阅：速刷动作按 `activity` 分派，与精练动作互斥（409）；所有不调模型的动作在一个 `IMMEDIATE` 事务内重读、校验、修改、写回执，路由不再二次保存；摘取由服务端从本人 `role = user` 消息截取并校验所有者与位置；`cardSnapshot` 冻结；默认子练习映射唯一，另开不改映射；正文表随删除清空、元数据表保留。
2. 疑问的决定：八项暂行做法全部同意。补充两点给后续：
   - 槽位为每个要求的“回答 + 理由”（权衡题另有好处 / 坏处）。WP4b 检查时以本题 `subquestions` 是否被回答为准，不得把空槽机械判为缺；WP5 界面可按要求给出更贴切的槽位提示（例如原因题的“理由”显示为“展开”）。
   - `needs_development` 卡片编辑后保持该状态但 `content_version` 前进；WP5 应以 `last_checked_version ≠ content_version` 显示“已修改，未复查”。
3. 移交 WP4b：生命周期接口目前对速刷会话返回 409，但 RFC §8 要求额度用尽后仍可“搁置”。WP4b 须让 `QUICK_ENABLED` 有效时的速刷会话支持 `POST .../lifecycle`。
4. 测试证据（由实现者完成）：五项检查 132/132、22/22、4 组 PASS，负责人重跑确认；端到端 21 步与 5 份页面 HTML：精练写前 / 写作页左栏显示冻结的卡片快照，源卡片删除后快照仍在；速刷开关关闭时只读。
