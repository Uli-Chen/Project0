# WP2b 实现与自测报告

日期：2026-11-01。分支：`question-bank-0.4`；基线：WP2a `cd6752b`（WP1 `4e4f547`）。

WP2b（QB-05、QB-06、QB-07）已实现并完成指定自测，待 Claude Code 验收。本报告不代表负责人已验收。未提交、切分支或 push；未联网、增加依赖、调用真实模型。数据库验证全部使用临时 SQLite，未打开或修改应用数据库。开工时已有的 `docs/plans/tasks/WP2b_prompt.md` 未改动。

已阅读 AGENTS、开发方案 §3/WP2b、指定 RFC/原型章节、WP1/WP2a 负责人记录及指定代码；服务端实现前阅读本地 Next.js 的 instrumentation 指南、文件约定及 Route Handlers 指南。遵守别名证据冲突返回 `ambiguous`，不按候选数量推断匹配。

## 改动文件

| 文件 | 改动 |
|---|---|
| `lib/db/schema.ts` | 六张表：attempt_markers、completion_events、familiarity、legacy_scan、default_continuations、request_receipts；仅 users 外键级联，无练习外键；完成时间/资格等约束。 |
| `drizzle/0002_thick_toxin.sql`、`drizzle/meta/0002_snapshot.json`、`drizzle/meta/_journal.json` | `npm run db:generate` 生成的追加迁移；既有 0000/0001 不变。 |
| `lib/rules/original-freshness.ts` | 纯资格函数：重写/既有提交/反馈优先判 repeat，其次 unknown，否则 fresh。 |
| `lib/db/question-context.ts` | 从版本化别名及候选加载解析上下文；调用现有纯解析器；有冻结快照时使用快照。 |
| `lib/db/practice-facts.ts` | 接受原稿与完成反馈的 IMMEDIATE 短事务、标记写入、单条/批量 completedAt 投影、曝光未知判断、删除标记函数。 |
| `lib/db/request-receipts.ts` | 按用户与幂等键查写回执；重复返回首次结果，不同 action/attempt/paramsHash 抛 status=409 的 ReceiptConflict。 |
| `lib/db/migrate-0.4.ts` | 新用户扫描记录、逐用户扫描、幂等启动扫描；支持显式指定新别名版本重扫，保留原 cutoff。 |
| `scripts/migrate-0.4.ts`、`instrumentation.ts`、`package.json` | 新增 `db:migrate-0.4`；Node 启动扫描，逐用户失败隔离，整体异常兜底记录日志。 |
| `lib/db/queries/sessions.ts` | get/list 从事件表覆盖 completedAt，忽略 JSON 中过时的投影值。 |
| `app/api/auth/register/route.ts` | 用户插入与 unresolved_count=0 扫描记录在同一事务。 |
| `lib/pipeline/types.ts`、`read-session.ts`、`initial.ts` | originalFreshness、reviewStatus；缺失默认 null/none，继续保留未知字段。 |
| `lib/pipeline/engine.ts`、`schemas.ts` | 接受/完成 checkpoint 类型；首次必需反馈成功立即保存；可选回顾失败独立；retryReview；原稿 evaluate 仅允许 writing/evaluating；已有完成事件的重评记账仅由底层写函数支持（C）。 |
| `lib/pipeline/retry-review.ts` | 独立回顾重试三段执行：加锁预留、解锁调用、加锁合并；保护并发保存及删除。 |
| `app/api/sessions/[id]/actions/route.ts` | 原稿 checkpoint 接入同连接事务；独立回顾重试入口；保留原 completedRequests 去重；新原稿评分请求在写 pendingAction 前校验阶段，阶段错误不改记录。 |
| `app/api/sessions/[id]/route.ts` | GET 的忙碌状态包含独立回顾；已中断 pending 回顾只读投影为 failed，不改数据库。未接入删除标记函数。 |
| `lib/prototype/session-store.tsx`、`components/essay/feedback-tab.tsx` | 回顾状态、失败重试按钮与轮询恢复；评分/问题区维持现状。 |
| `tests/practice-facts.test.ts`、`tests/helpers/practice-db.ts`、`tests/helpers/concurrent-submit.ts` | 21 项规则、事务、扫描、回执测试；双进程并发提交。 |
| `tests/practice-api.test.ts` | 7 项真实 API/认证/启动钩子测试，模型仅用假 fetch。 |
| `tests/ui/optional-review.test.ts` | 4 项回顾状态渲染测试，验证成绩与问题保留。 |
| `tests/helpers/legacy-session.ts`、`tests/session-compat.test.ts`、`tests/session-api.test.ts` | 扩展旧 JSON 默认值与新动作的兼容性断言。 |
| `scripts/test-db.ts` | 空库、基线→已导入 WP1→WP2b 升级、六表练习删除保留与账户级联。 |
| `原型/90_共享规范.md`、`原型/12_题库与推荐.md` | 新 JSON 字段两行；补充扫描所需的两个无正文元数据列。 |
| `docs/plans/reports/WP2b.md` | 本报告。 |

## 实现边界与不变量

1. 接受原稿时以同一个 better-sqlite3 连接执行 `BEGIN IMMEDIATE`：读取家族事实、计算资格、保存不可变原稿时间/资格、更新 familiarity、补 attempt marker，最后保存会话。模型调用在事务外。不同会话、不同连接的家族竞争由 SQLite 串行化，不依赖 JavaScript 单线程或每会话锁。
2. 重试读取已保存的时间与资格。旧原稿已有 submitted/evaluation 但无提交时间时，不补当前提交时间；即使启动扫描未完成，重试也保守记为 unknown_time 的正面提交事实。unknown_time 不被新提交覆盖。未知资格仍消耗家族提交事实，之后必为 repeat。
3. 第一次评分的提示词、`{ task, essay, sentences }` 输入和 schema 与 HEAD 逐字比较相同。首次完整评分/问题输出校验成功后，反馈会话与 completion_events 原子保存；事务失败恢复到已接受原稿状态，错误 checkpoint 不会把未成功提交的反馈泄漏到数据库。
4. 回顾成功/失败只保存 review/reviewStatus，不触碰完成事件或 feedbackUpdatedAt。首次自动回顾沿用原精练锁；新增 retryReview 采用三段式。重试合并最新会话，只合并回顾字段；期间修改回顾输入则丢弃过时回顾并置 failed；期间删除则返回 404，不重新插入正文。
5. 按 C 处理：仅底层 `commitPracticeCheckpoint` 支持已有完成事件的重评记账，保存新反馈并写 feedbackUpdatedAt，事件的时间/资格等不变，不新建事件。原稿 evaluate 入口恢复为 writing/evaluating；feedback/compared/finished 的新评分请求返回阶段错误 409，不调用模型、不改记录。旧 finished 的未知时间事件始终为 null；保留 acceptOriginal 对 stored.stage === "finished" 的防御分支，并在函数层验证启动未扫描时也先保留旧完成事实。旧 submitted/evaluation 而未 finished、无事件的会话在首次成功反馈时获得当前完成时间。正式重评入口及派生内容失效规则需另定产品契约。
6. getSession/listSessions 从事件表取 completedAt，包括明确覆盖 JSON 中伪旧日期为 null；readSession 本身仍纯粹补默认值，不查询数据库。
7. 扫描经 readSession，绝不保存会话。createdAt 只用于练习开始标记；不用于推算提交或完成时间。只有 finished 才补 legacy completion，单有 evaluation 不补完成。扫描事务失败则连同该用户的标记一起回滚，其他用户继续。
8. 启动失败不会阻止服务启动：逐用户错误与外层错误均有日志。`legacy_scan` 缺行时，任何家族的曝光判断一律 unknown；已有提交/反馈的正面证据仍优先 repeat。缺题库/别名时，有历史记录的用户不被标为已扫描。新注册用户与零未解析扫描记录原子创建。
9. `legacy_scan.cutoff_exposure_keys_json` 固定扫描时家族集合；`questions.bank_version` 是首次收录标签，不能当目录成员表或排序版本。之后真正新增的家族不受旧不确定性影响。`attempt_markers.resolution` 保留无正文的解析状态，避免删除未解析正文后重扫错误地清除不确定性；仍在的会话可经人工审阅的新别名补正面家族事实，不改原 JSON。
10. 六表只外键到 users。`markPracticeDeleted` 幂等写 deleted_at/evidence_deleted；本包只提供函数和测试，未接入删除接口。正文仍在 writing_sessions；后续 Quick 正文表尚不属于本包。request_receipts 没有接入速刷，也没有替换 completedRequests。
11. 完成/曝光/扫描不查询任何功能开关。保留单常驻 Node 进程部署边界；未引入队列或分布式锁。

## 验收用例对应

下表测试位于 `tests/practice-facts.test.ts`，另行注明者除外；全部通过。

| 要求 | 测试名 / 证据 | 结果 |
|---|---|---|
| 12 §9 #1；RFC Required feedback saved; optional review fails or response is lost | `1 Required feedback saved; optional review fails or response is lost: one completion; retry/refresh/finish never moves it`；API `Required feedback API commit is visible before optional call; projection overrides stale JSON and lost response replay calls no model` | 首次调用后、回顾调用前即有 feedback/事件；失败不设置 evalError；单独重试只有一次回顾调用；finish/重放不改事件。 |
| #1 回顾 UI | `tests/ui/optional-review.test.ts` 的 `Required feedback saved; optional review failed/pending/ok/none: score/issues remain visible and failure alone offers 重试` | 4/4；只有失败显示重试按钮；成绩与问题始终保留。 |
| #1b | `1b 原稿评估第一次调用失败: accepted time/freshness survive and scoring retry never recalculates` | 首次无事件，原稿时间与 fresh 已保存；第二篇 repeat；重试第一篇仍 fresh、原时间不变。 |
| #1c | `1c 旧会话原稿已提交、评分一直失败；迁移后重试成功: current completion with null historical submission time` | 当前完成时间，历史提交 null，历史 familiarity 保持 unknown_time。 |
| #1d | `1d 家族曝光未知时提交原稿，之后历史解析为已知: frozen unknown then repeat` | 补审别名并重扫后，原稿/事件仍 unknown；后续 repeat。 |
| #1e | `1e 家族已有反馈记录 prior_feedback=known 但没有提交记录: repeat and unconditional submission marker` | repeat，仍写当前提交时间与 known 提交事实。 |
| #2 | `2 两个标签页同时提交同一家族: two processes and connections on a real temporary SQLite grant exactly one fresh` | 两个子进程各自持有 SQLite 连接，通过 IPC ready 屏障同时提交；恰一 fresh、一 repeat，fresh_attempt_id 指向赢家。 |
| #5；RFC Old finished record saved or regraded after upgrade | `5 Old finished record saved or regraded after upgrade: unknown-date event stays immutable and only feedbackUpdatedAt changes` | 普通保存不改事件；直接向 commitPracticeCheckpoint 传入 feedback 阶段及新 evaluation，保存新反馈并更新 feedbackUpdatedAt，完整事件不变；completed_at=null；有日期的完成数仍 0。 |
| 原稿评分阶段限制（修订 1） | API `original evaluate rejects feedback/compared/finished with 409, no model call and byte-for-byte unchanged records` | 同时验证 runAction 和真实 POST；三阶段均为阶段错误 409，零模型调用，正文及六张事实表逐字节不变，含版本、时间戳和派生结果。 |
| RFC Free-entry repeat of a question family or alias | `Free-entry repeat of a question family or alias: same family cannot become fresh through pasted normalized text` | 旧 ID 首次提交后，同家族大写/全角空白的粘贴题目 repeat，仍可获得完成。 |
| 扫描幂等、JSON 字节不变、cutoff | `migration scan is idempotent, preserves entire session table byte-for-byte, and marks all cutoff families unknown on unresolved history` | 比较整张 writing_sessions 的所有列（含原 JSON 字符串）；重跑不变；未解析数>0；当时全部家族 unknown，后加家族已知。 |
| 别名冲突 | `alias ID/text conflict remains ambiguous even with one candidate and poisons cutoff exposure` | 候选只有一个也不视作 resolved，不生成家族匹配事实。 |
| 新用户、扫描失败 | `new user has unresolved_count=0; unscanned or failed startup scan stays unknown and logs without blocking other users`；API `registration atomically writes legacy_scan unresolved_count=0; scan write failure rolls back the user`、`startup hook logs scan failure and returns; missing scan remains absent for conservative exposure checks` | 真注册返回 201 且 scan=0；故障注入回滚用户；启动日志可观测，其他用户扫描继续。 |
| 无题库时不得误清未知 | `missing catalog cannot finalize legacy scan; unscanned acceptance is unknown then repeat` | 有历史时拒绝完成扫描；未扫描提交 unknown，后续 repeat。 |
| 事务回滚 | `feedback save failure rolls back the event, feedback and familiarity together; error checkpoint cannot leak feedback`；`original acceptance rollback leaves no marker or fresh claim; missing/deleted attempt cannot be recreated` | 在写入后的 persist 注入异常，整事务回滚；既不漏完成也不占新原稿资格。 |
| 必需反馈校验 | `invalid partial scoring output cannot satisfy the required-feedback contract or create a completion` | 仅分数、缺问题反馈的输出及修复重试均拒绝，不创建事件。 |
| 删除后未知/正面事实 | `deleted unresolved legacy evidence remains unknown on rescan; reviewed surviving aliases add positive facts without rewriting JSON` | 删除未解析文本不清空未知；存活别名解析补事实，JSON 不变。 |
| unknown_time/重写 | `unknown_time prior submission survives a new repeat; explicit rewrite records time and never claims freshness` | 保持 unknown_time；重写也写提交时间但不占 fresh。 |
| 未扫描旧记录重评/重试 | `old finished regrade stays unknown-date even when startup scanning has not succeeded`；`old accepted original retry before successful scan retains unknown time and blocks later fresh claims even if scoring fails` | 旧 finished 通过底层 acceptOriginal/completeOriginal 验证；启动失败不造成当前周伪完成或后来 fresh。 |
| 回执与删除辅助函数 | `retained receipts are owner-scoped and immutable; conflicting parameters return 409; deletion markers are idempotent` | 所有者隔离；原回执不覆盖；参数冲突 409；删除时间首次写入后不移动。 |
| 可选重试并发/删除/中断 | API `optional review retry releases its lock during model call, preserves concurrent saves, and never repeats scoring or completion`、`deleting an attempt during optional review retry never recreates content or changes completion`、`interrupted optional review is a read-only failed projection and retries only review` | 调模型时无 SQLite 事务，可保存；第二次重试 409；删除后不复活；GET 中断投影不写 JSON。 |
| test:db 空库/旧库/删除 | `scripts/test-db.ts` 四组 PASS | 空库全量及重放；0000 有用户/正文→0001 导入目录→0002，用户/认证/正文/题库不变；六表保留、正文消失；账户删除清空六表。 |
| 原测试 | tests/agent.test.ts、tests/learning-flow.test.ts 及其他原测试 | 全部通过；这两个文件未改动。 |

## 命令结果

环境：Node v25.8.2，npm 11.11.1（项目声明 Node 24.x；未安装或切换运行时）。

| 命令 | 最终结果 |
|---|---|
| `npm run db:generate` | 退出 0，13 表，追加 `0002_thick_toxin.sql`。开发中的未交付生成文件已重新生成合并为这一条；未改已验收迁移。 |
| `npm run lint` | 退出 0，零 warning。 |
| `npm run typecheck` | 退出 0，Next 路由类型生成与 tsc 通过。 |
| `npm test` | 退出 0，69/69（原 41 + 本包 28，含修订 1 新增测试）。 |
| `npm run test:ui` | 退出 0，15/15（原 11 + 本包 4）。 |
| `npm run test:db` | 退出 0，4 组 PASS。 |
| 临时库 `npm run db:migrate-0.4` 两次 | 均退出 0；首次 `{succeeded:1,failed:0}`，第二次 `{succeeded:0,failed:0}`；整张正文表字节不变，恰一旧事件。 |
| `git diff --check` | 退出 0。 |
| 冻结文件与 G-01 核对 | 评分提示词及输入调用片段与 HEAD 一致；全部原有 data/question-bank 文件、initialize.ts、package-lock.json、既有迁移/快照不变。 |

开发期发现并修正两项测试问题：UI 新测试的 createElement 写法触发 no-children-prop，已改用 jsx runtime；数据库测试随机旧 ID 与替换题干形成真实别名冲突，已将测试 ID 改成明确的粘贴题 ID，未放宽解析规则。注册故障注入测试会输出预期的 `Request failed: test scan write failure`，该测试断言 500 与事务回滚，不是未处理的失败。

## 原有测试的调整及原因

- `tests/agent.test.ts`、`tests/learning-flow.test.ts`：零修改，原断言全部通过。自动回顾仍在首次评估流程中尝试，只改变保存边界与可选失败语义，所以无需改原成功流程断言。
- `tests/helpers/legacy-session.ts`：旧记录 fixture 同时删除 originalFreshness/reviewStatus，确保测试确实模拟缺失新字段，而不是把 createSession 新默认值混进旧数据。
- `tests/session-compat.test.ts`：原“所有新增字段都应为 null”循环仅排除枚举 reviewStatus，并新增明确断言 `none`；originalFreshness 仍参与 null 断言。其余未知字段/版本/只读断言未放宽。
- `tests/session-api.test.ts`：在“所有动作必须拒绝不支持的会话”数组增加 retryReview；原断言不变。
- `scripts/test-db.ts`：保留原三组断言，扩展迁移表清单与已导入 WP1 的升级阶段，再增加练习删除保留/账户级联断言。

## 疑问

以下列出原疑问的候选方案与处理结果：负责人已同意前五项暂行边界，最后一项按修订 1 改为 C。

| 问题 | 候选方案 | 暂时采用的最保守做法 |
|---|---|---|
| 单个 cutoff_bank_version 无法从 questions.bank_version 还原目录成员，未来同库可能存在多个首次收录标签。 | A. 比较版本字符串；B. 新建完整目录发布成员表；C. 保存 cutoff 家族集合。 | C：增加 cutoff_exposure_keys_json 作为实际判断依据；cutoff_bank_version 当前为 mock-20261101-v1，混合来源时记录去重排序后逗号连接的标签，仅作元数据，不比较大小。完整发布成员表留待需要时设计。 |
| 删除未解析正文后，重扫怎样区分已确认 not_in_catalog 与真正 unresolved？ | A. 删除后清零；B. 永久锁住整用户旧 count；C. 保留每个 marker 的解析状态。 | C：增加无正文 resolution 列；删掉的 ambiguous/unmatched 继续计数。未提供能在无原文时猜测解析或清零的接口。 |
| 无法解析到家族，含人工确认 not_in_catalog 的原稿，怎样标 freshness？ | A. 无家族也 fresh；B. 造文本哈希家族；C. unknown。 | C：不虚构家族；仍记录本次提交时间及完成，关联重写优先 repeat。not_in_catalog 不增加整个用户的 legacy unresolved_count。 |
| 粘贴题/旧别名匹配家族后是否补 questionId 与主题？ | A. 猜一个当前家族代表题；B. 只记录确定的 exposureKey，questionId/topic 保持空。 | B：遵守 12 §8“粘贴题没有 questionId、不进主题统计推荐”；只有已冻结快照才填题目版本与主主题。不由标签或可能多题的家族猜题号。 |
| 同时有 continuedFromQuickId 与 rewriteOfDeepId 时，单列 relation 如何分类？ | A. continuation；B. rewrite；C. 新枚举。 | B：rewrite 优先，资格也是 repeat；JSON 原样保留两个独立关系，不增加新枚举。 |
| 已完成会话重评的入口与后续展示没有单独 UI 契约。 | A. 新增重评按钮；B. 允许既有 evaluate 动作在 feedback/compared/finished 执行原稿重评，成功保存仍遵循 §4 的 feedback 阶段；C. 仅底层写函数支持。 | C：仅底层 commitPracticeCheckpoint 支持“若重评发生”的记账语义；原稿 evaluate 只允许 writing/evaluating，不放开 feedback/compared/finished。不提供正式重评产品入口；后续入口与 comparison/finish/revisionScores 等派生内容失效规则交负责人另定。 |

## 未完成事项与验证边界

- 无遗漏的 WP2b 编码项或指定自动化验收；负责人已审阅，结论为修改后通过；R1 修订与自测见末节，待负责人复核。未修改 99 清单、未填写验收提交号。
- `markPracticeDeleted` 尚未接入 DELETE；这是 WP2c 明确范围。default_continuations 仅建表；request_receipts 仅通用读写，没有开始速刷或改造 completedRequests。
- 未进行真实数据库迁移或发布。部署操作顺序仍为：先应用追加 schema 迁移，再导入已审阅题库/别名，再运行 `npm run db:migrate-0.4`（或由启动扫描补做）。扫描不会自动导入题库、改写正文或调用模型。
- UI 使用现有静态渲染测试，重试行为用真实路由加假模型验证；未做浏览器人工点击/截图验收，交负责人完成。
- 未运行 build、未在 Node 24 另跑；这两项不在本包指定五项命令中。未宣称 Quick 正文表或 WP2c 删除接口已经完成。


## 修订 1

按负责人 R1 收回原稿重评入口扩大，疑问最后一项改为 C；其余五项暂行边界保持不变。

- `lib/pipeline/engine.ts`：原稿 evaluate 允许阶段恢复为 writing/evaluating；共用阶段校验供引擎及路由调用。修订稿阶段限制不变。
- `app/api/sessions/[id]/actions/route.ts`：在 completedRequests 幂等重放判断之后、pendingAction 写入之前校验原稿阶段，使新非法请求返回 409 时连版本与时间戳也不改动。原请求重放仍返回已有结果，不重新评分。
- `tests/practice-facts.test.ts`：用例 5 直接向 commitPracticeCheckpoint 提交已有旧完成事件、stage=feedback、带新 evaluation 的状态；未成功扫描的旧 finished 用例改为直接调用 acceptOriginal/completeOriginal，保留防御分支覆盖。原断言保留，并增加新反馈持久化、完整事件不变等断言。底层写函数实现未改。
- `tests/practice-api.test.ts`：新增一个覆盖 feedback/compared/finished 的测试，同时验证引擎与真实路由均返回阶段错误 409、零模型调用、正文与六张事实表不变；compared/finished 构造非空 comparison/revisionScores/finish，核对派生内容保持原样。

本轮指定检查全部退出 0：

| 命令 | 修订 1 结果摘要 |
|---|---|
| `npm run lint` | 通过，零 warning。 |
| `npm run typecheck` | Next 路由类型生成与 tsc 通过。 |
| `npm test` | 69/69 通过，0 失败、0 跳过；包含新增三阶段拒绝测试及两条底层重评测试。 |
| `npm run test:ui` | 15/15 通过，0 失败、0 跳过。 |
| `npm run test:db` | 4 组 PASS：空库迁移/重放、旧库升级保留、删除练习保留事实、幂等及所有者/级联/外键约束。 |

注册测试仍输出预期的故障注入日志 `Request failed: test scan write failure`，对应测试通过。验证仅使用临时 SQLite 和假模型；未联网、加依赖或调用真实模型，未提交、切分支或 push。

## 端到端验证

2026-11-01，由实现者完成。四个指定情境全部通过，未发现新的 WP2b 实现缺陷；本轮只追加本节和 `docs/plans/reports/WP2b_e2e/` 中的可复跑脚本、HTML、JSON 与日志，没有修改应用实现。上文“UI……交负责人完成”的历史验证边界由本节替代：所有测试由实现者执行，负责人审阅证据。本次采用创始人允许的进程内验证路径，未进行浏览器点击或截图，不把静态渲染宣称为浏览器交互验证。

### 环境与准备

- 仓库 `/Users/chen/Desktop/opc`，分支 `question-bank-0.4`；未提交、切分支或 push，保留原工作区改动，未修改 `.claude/`。
- macOS 27.2（26B118），Node v25.8.2，npm 11.11.1，Next 16.4.2。项目声明 Node 24.x；本次没有安装或切换运行时。
- 新数据库：`/private/tmp/opc-wp2b-e2e.ufeRft/e2e.db`。检查命令的防御性默认库路径为同目录 `checks-fallback.db`，各现有测试仍自行创建临时库。未打开或修改 `data/app.db`。
- 未联网、未加依赖。启动与脚本入口显式设置 `LLM_API_KEY=''`，没有读取或使用 `.env.local` 的模型密钥。仅假模型调用期间设置固定假密钥 `offline-fixture-only`，地址限定为 `http://127.0.0.1:1/offline-fake`，所有模型 `fetch` 在内存中截获并返回夹具，不发送网络请求；其余 harness `fetch` 一律抛错。
- `npm run db:init` 首次退出 1：`tsx` CLI 创建 IPC 管道被沙箱拒绝（`listen EPERM .../tsx-501/51201.pipe`）。改用 Node 的 tsx import loader 执行同一 `scripts/db-init.ts`，退出 0。随后 drizzle 迁移成功，导入返回 38 题、38 条新增题目、7 条新增别名。

实际准备步骤与命令（从仓库根目录运行）：

```sh
mktemp -d /private/tmp/opc-wp2b-e2e.XXXXXX
# 本次返回 /private/tmp/opc-wp2b-e2e.ufeRft；复跑时使用新返回的目录。
export DATABASE_PATH=/private/tmp/opc-wp2b-e2e.ufeRft/e2e.db
export LLM_API_KEY=''
export NEXT_TELEMETRY_DISABLED=1
npm run db:init                              # IPC EPERM，退出 1
node --import tsx scripts/db-init.ts          # 同一初始化脚本，退出 0
node node_modules/drizzle-kit/bin.cjs migrate # 退出 0
npm run db:import-questions                  # 退出 0
node --conditions=react-server --import tsx docs/plans/reports/WP2b_e2e/verify.mjs seed
LLM_BASE_URL=http://127.0.0.1:1 npm run dev -- --hostname 127.0.0.1 --port 31404
```

最后的 `next dev` 退出 1：`listen EPERM: operation not permitted 127.0.0.1:31404`，尚未进入服务就绪阶段。因此没有可供浏览器访问的 HTTP 服务，未生成 PNG；按任务约定改为直接调用启动钩子、真实路由与真实页面组件，保存完整 HTML（包含要求的关键片段）和 SQL 输出。

准备证据：[01-db-init.log](WP2b_e2e/01-db-init.log)、[02-db-init-fallback.log](WP2b_e2e/02-db-init-fallback.log)、[03-drizzle.log](WP2b_e2e/03-drizzle.log)、[04-import.log](WP2b_e2e/04-import.log)、[05-seed.log](WP2b_e2e/05-seed.log)、[06-next-dev.log](WP2b_e2e/06-next-dev.log)。

验证入口：[verify.mjs](WP2b_e2e/verify.mjs)。它先检查数据库在指定临时目录且入口模型密钥为空，再访问数据库；没有直接调用扫描内部函数来代替启动钩子，也没有用测试版业务路由替换实际路由。页面渲染入口：[render.mjs](WP2b_e2e/render.mjs)。

### 情境 1：启动扫描与再次启动

步骤：

1. `seed` 创建唯一用户 `wp2b-e2e-user` 及临时认证 Cookie 对应的会话记录；断言无 `legacy_scan` 行。插入旧作文 `wp2b-legacy-finished`：`stage=finished`、无 `schemaVersion`，`prompt.id=technology`，使用对应的远程办公原题文本，包含 `submitted.original` 与 `evaluation`。JSON 故意保留缩进、末尾换行及旧兼容夹具的未知字段。
2. 设置 `NEXT_RUNTIME=nodejs`，在独立 Node 进程中执行 `instrumentation.ts` 的 `register()`，查询扫描行、完成事件、familiarity，并比较 JSON 的 Buffer 字节。
3. 退出第一进程，再在第二个独立进程中执行同一钩子；比较 `writing_sessions` 及六张事实表的完整查询结果。

```sh
node --conditions=react-server --import tsx docs/plans/reports/WP2b_e2e/verify.mjs scan-1
node --conditions=react-server --import tsx docs/plans/reports/WP2b_e2e/verify.mjs scan-2
cmp docs/plans/reports/WP2b_e2e/legacy-before.json docs/plans/reports/WP2b_e2e/legacy-after-scan-1.json
cmp docs/plans/reports/WP2b_e2e/legacy-before.json docs/plans/reports/WP2b_e2e/legacy-after-scan-2.json
shasum -a 256 docs/plans/reports/WP2b_e2e/legacy-before.json docs/plans/reports/WP2b_e2e/legacy-after-scan-1.json docs/plans/reports/WP2b_e2e/legacy-after-scan-2.json
```

观察结果：全部退出 0。两次 PID 分别为 51437、51438。该用户新增且仅有一行 `legacy_scan`，`unresolved_count=0`；该会话仅有一条完成事件，`legacy=1`、`completed_at=null`、`original_submitted_at=null`。`qfamily_remote_work` 的 `deep_original_submitted=unknown_time`、`prior_feedback=unknown_time`，没有补造旧提交时间。再次启动全部表快照不变，包括 `scanned_at`。前后 JSON 字节完全相同，三个文件 SHA-256 均为 `18d972c25ebdd6beda5b43bb29a27c31ea8afe528f93e89971991e9b70fb2123`；后续情境结束后再次比较旧 JSON 仍相同。

证据：[07-scan-1.log](WP2b_e2e/07-scan-1.log)、[08-scan-2.log](WP2b_e2e/08-scan-2.log)、[scan-before.json](WP2b_e2e/scan-before.json)、[scan-1.json](WP2b_e2e/scan-1.json)、[scan-2.json](WP2b_e2e/scan-2.json)、[11-byte-equality.log](WP2b_e2e/11-byte-equality.log)，以及目录中的 `legacy-before.json`、`legacy-after-scan-1.json`、`legacy-after-scan-2.json`。

### 情境 2：旧会话正常打开

情境 2～4 的主命令（自动执行后续步骤并在每个状态调用页面渲染）：

```sh
node --conditions=react-server --import tsx docs/plans/reports/WP2b_e2e/verify.mjs scenarios
# 主命令内部以独立 SSR 进程运行以下页面命令；也可单独复核旧页：
node --import tsx docs/plans/reports/WP2b_e2e/render.mjs wp2b-legacy-finished legacy
```

步骤：先调用真实 `GET /api/sessions/wp2b-legacy-finished`，无 Cookie 返回 401，带该临时用户的 `wm_session` 返回 200。再将同一 Cookie 放入 Next request store，调用 `app/essays/[id]/page.tsx` 的 `EssayPage()`，经实际 `requireUser()`、数据库读取与 `SessionView` 分派，使用 React `renderToStaticMarkup` 渲染完整 `EssayScreen`。

观察结果：`EssayPage → SessionView → SessionProvider → EssayScreen` 分派断言通过，HTML 有原界面的正文容器、检查面板、练习成绩 `6.0` 和问题“展开例子”；没有“练习内容 · 只读”或“不支持编辑”提示。页面 props 与 GET 返回均为 `stage=finished`、`completedAt=null`，未把 finished 阶段误当不支持的会话。

渲染适配仅包括：映射 `server-only` 到其服务端空入口、使用 Next 的真实 navigation 客户端入口，并注入静态 SSR 所需的 router/Tooltip 上下文。未替换认证、数据库读取、页面分派或应用组件；不执行 hydration 或浏览器事件。任何渲染期间的导航或网络请求都会导致测试失败。

证据：[legacy.html](WP2b_e2e/legacy.html)、[legacy-render.json](WP2b_e2e/legacy-render.json)、[legacy-projection.json](WP2b_e2e/legacy-projection.json)、[09-scenarios.log](WP2b_e2e/09-scenarios.log)。

### 情境 3：回顾失败、成功重试与再次失败

步骤均由上述 `scenarios` 命令执行，所有 API 方法均为真实 route handler，在 Next request store 内使用该用户的 Cookie 与同源 Origin：

1. `POST /api/sessions`，请求 `{kind:"free",mode:"practice",prompt:<目录题目文本>}`，返回 201。`PATCH /api/sessions/<id>` 保存正文及一个提纲立场；`POST /api/sessions/<id>/actions` 执行 `startWriting`，均返回 200。
2. 对同一 actions 路由执行 `{action:"evaluate",kind:"original",requestId:<新 UUID>}`。假评分返回完整评分/问题 JSON；可选回顾返回 503。动作返回 200，持久化 `stage=feedback`、`reviewStatus=failed`，产生一条完成事件。保存该事件全部列以及评分/问题快照。
3. 渲染 `/essays/<id>`，断言 HTML 同时存在“提纲回顾失败，评分与问题反馈已保存。”、真正的 `<button ...>重试</button>`、练习成绩 `6.0` 和“展开例子”。
4. 对真实 actions 路由执行 `{action:"retryReview",requestId:<新 UUID>}`，成功假模型返回回顾 JSON。断言只调用一次模型，实际 system instruction 为回顾指令，不是评分指令；回顾新增“离线回顾成功标记”。
5. 为复用同一会话检验失败分支，仅在临时库把会话 JSON 的 `reviewStatus` 从 `ok` 重置为 `failed`（已成功回顾的重试本来应直接返回，不会调模型）。不更改评分、问题、阶段或事件。再以新 requestId 调用真实 `retryReview`，假模型返回 503，并重新渲染页面。

观察结果：会话 ID 为 `2ee1c359-1fc7-4105-9079-d6b6e90c658c`。成功重试后 `reviewStatus=ok`、失败提示和重试按钮消失；失败重试后 `reviewStatus=failed`，提示与按钮重新出现。两次动作均返回 200，各仅一次回顾模型调用，评分未重跑；评分与问题深比较相同，`stage` 始终为 `feedback`、`feedbackUpdatedAt=null`。该会话的完成事件始终只有一条，全部列深比较相同，`completed_at` 始终为 `2026-11-01T04:09:23.912Z`。

证据：[review-failed.html](WP2b_e2e/review-failed.html)、[review-ok.html](WP2b_e2e/review-ok.html)、[review-failed-again.html](WP2b_e2e/review-failed-again.html)；每份 HTML 均有对应 `*-render.json`。事件/会话快照见 [review-failed-initial.json](WP2b_e2e/review-failed-initial.json)、[review-retry-ok.json](WP2b_e2e/review-retry-ok.json)、[review-retry-failed.json](WP2b_e2e/review-retry-failed.json)；实际假模型调用输入与顺序见 [model-calls.json](WP2b_e2e/model-calls.json)。

### 情境 4：新原稿资格与当前完成时间

步骤：`scenarios` 从目录选择该用户尚未提交过的另一家族题目（本次为 `qfamily_science_subject_shortage`），通过真实 `POST /api/sessions` 新建精练会话，断言 `activity=deep`、`originalSubmittedAt=null`、无完成事件。通过真实 PATCH 写入正文，再执行 `startWriting`。记录请求前时间，向真实 actions 路由提交原稿 `evaluate`，仅由假模型返回评分/问题。模型被调用时读取数据库，检查接受原稿 checkpoint；响应后再次读取会话及完成事件并渲染页面。

观察结果：新会话为 `d73e3e57-7eef-4849-8e0c-6e0156e65b54`。模型调用前即已持久化 `stage=evaluating`、`originalSubmittedAt=2026-11-01T04:09:25.197Z`，此时完成事件数为 0。动作返回 200 后，`stage=feedback`、`originalFreshness=fresh`；数据库恰有一条 `legacy=0`、`freshness=fresh` 的完成事件，`completed_at=2026-11-01T04:09:25.199Z`，位于请求前后 `04:09:25.196Z`～`04:09:25.200Z` 内。事件的提交时间与会话相同，API 的 `completedAt` 与事件完成时间相同。未填写提纲或重点，因此本情境只有一次评分调用、`reviewStatus=none`；完整反馈页仍显示评分与问题。

证据：[new-original.json](WP2b_e2e/new-original.json)、[new-original.html](WP2b_e2e/new-original.html)、[new-original-render.json](WP2b_e2e/new-original-render.json)。整轮模型调用合计 5 次：构造失败回顾夹具的评分和回顾各一次、成功/失败回顾重试各一次、新原稿评分一次，全部为内存假响应。

### 数据库复核与命令结果

```sh
DATABASE_PATH=/private/tmp/opc-wp2b-e2e.ufeRft/e2e.db LLM_API_KEY='' \
  node docs/plans/reports/WP2b_e2e/inspect.mjs
```

此命令以只读连接执行 [queries.sql](WP2b_e2e/queries.sql)，输出扫描行、每条事件的全部时间/资格字段、familiarity 以及 JSON 阶段/回顾/提交字段，`PRAGMA integrity_check=ok`。结果见 [10-query-results.log](WP2b_e2e/10-query-results.log)，完整最终事实表快照见 [database-final.json](WP2b_e2e/database-final.json)。数据库文件保留在上述临时目录，不放入仓库。

随后运行五项指定检查，均显式指定临时默认库、空模型密钥、本地无效模型地址并禁用 Next telemetry：

```sh
export DATABASE_PATH=/private/tmp/opc-wp2b-e2e.ufeRft/checks-fallback.db
export LLM_API_KEY=''
export LLM_BASE_URL=http://127.0.0.1:1
export NEXT_TELEMETRY_DISABLED=1
npm run lint
npm run typecheck
npm test
npm run test:ui
npm run test:db
git diff --check
```

| 命令 | 本轮最终结果 | 证据 |
|---|---|---|
| `npm run lint` | 退出 0，零 warning | [check-lint.log](WP2b_e2e/check-lint.log) |
| `npm run typecheck` | 退出 0，路由类型生成及 tsc 通过 | [check-typecheck.log](WP2b_e2e/check-typecheck.log) |
| `npm test` | 退出 0，69/69，0 失败、0 跳过 | [check-test.log](WP2b_e2e/check-test.log) |
| `npm run test:ui` | 退出 0，15/15，0 失败、0 跳过 | [check-test-ui.log](WP2b_e2e/check-test-ui.log) |
| `npm run test:db` | 退出 0，四组 PASS：空库迁移/重放、旧库升级保留、删除正文保留事实、幂等/所有者/级联/外键 | [check-test-db.log](WP2b_e2e/check-test-db.log) |
| `git diff --check` | 退出 0 | 工作区差异空白检查通过 |

首次 lint 仅发现本轮证据脚本 `verify.mjs` 中未使用的 `createSession` import，退出 1（[check-lint-initial.log](WP2b_e2e/check-lint-initial.log)）；删除该 import 后重跑通过。没有产品缺陷修复、范围扩展或新增依赖。已有注册测试仍输出预期故障注入日志，69 项全部通过。

## 负责人验收（2026-11-01，Claude Code）

**结论：修改后通过。**

1. 代码审阅：对照 RFC §3/§5/§7/§9、12 §3/§4/§7、13 §3、方案第 3 节约定。原稿接受四步与完成事件在同一 `BEGIN IMMEDIATE` 短事务内、模型调用在事务外；第一次评分的提示词与输入未变（G-01）；可选回顾独立、重试三段执行；扫描不改写会话、不编造时间；启动失败不阻止服务，缺 `legacy_scan` 一律按曝光未知。
2. 必须修改（已由实现者完成，见“修订 1”）：R1 撤回原稿重评入口扩大（`feedback` / `compared` / `finished` 阶段不可再评原稿），重评记账语义保留在 `commitPracticeCheckpoint` 并在函数层测试。
3. 疑问的决定：cutoff 家族集合（C）、marker 的 `resolution` 列（C）、不可解析题记 `unknown`（C）、粘贴题不补 `questionId`（B）、`rewrite` 优先（B）均同意；重评入口按 C（仅底层写函数）。
4. 测试证据（创始人 2026-11-01 定：测试全部由实现者完成，负责人审阅证据）：五项检查 69/69、15/15、4 组 PASS，负责人亦重跑确认；端到端四个情境的日志、HTML 与数据库查询已审阅——启动扫描写入旧完成事件（`completed_at = null`）且会话 JSON 字节不变、再次启动不变；旧会话走原编辑界面；回顾失败显示重试、重试不重跑评分且完成事件不变；新原稿提交时间与当前完成事件正确。沙箱禁止监听端口，端到端采用进程内路由与页面渲染，未做真实浏览器交互，记为已知边界。
