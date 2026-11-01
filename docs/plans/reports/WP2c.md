# WP2c：创建、生命周期与删除（QB-08、QB-11）

日期：2026-11-01。实现与自测完成，等待 Claude Code 验收；本报告不代表负责人已验收。

工作分支为 `question-bank-0.4`。实际工作基点为 `5a12593`（仅登记 WP2b 提交号），其前一提交为已验收的 `5736116`。未提交、切分支或 push，未联网、增加依赖、调用真实模型，未打开或修改 `data/app.db`，未修改 `.claude/`、冻结题库、既有迁移与 99 清单。开工时已有的 `docs/plans/tasks/WP2c_prompt.md` 未改动。

已读 AGENTS、开发方案 §3/§6/§7/WP2c、指定 RFC/原型章节、WP2a/WP2b 负责人验收记录与指定代码。改动前阅读本地 Next.js Route Handlers、Server and Client Components 指南。所有进程启动时 `LLM_API_KEY=''`；涉及模型流程的测试仅在进程内安装假 fetch 后临时设置无效测试 key，结束时恢复，子进程启动时仍为空。

## 改动文件

| 文件 | 改动 |
|---|---|
| `lib/pipeline/schemas.ts` | 两个严格 Zod 请求体以 `questionId` 的存在区分，拒绝混合字段；新增 lifecycle 校验；删除 finish 的 planChange schema 字段。旧创建默认值保留。 |
| `lib/db/create-practice.ts`（新增） | 当前题目读取、七字段快照、由快照生成 prompt、重写所有者/活动/家族检查；IMMEDIATE 事务中保存会话、marker、曝光与 receipt；旧创建复用 saveNewPractice。 |
| `app/api/sessions/route.ts` | 按题目创建、开关拒绝、幂等返回；旧创建写 marker（question 仍为 null）；开关开启后不注入旧重点。 |
| `lib/pipeline/http.ts` | ReceiptConflict 映射为 409 / idempotency_conflict。 |
| `lib/rules/lifecycle.ts`（新增）、`app/api/sessions/[id]/lifecycle/route.ts`（新增） | 纯转移函数；同源、Cookie、所有者和支持性校验；沿用会话锁；独立修改 lifecycle，不推进 stage。 |
| `lib/rules/student-action.ts`（新增） | 纯函数区分正文/提纲实际文字变化、学生动作、生命周期、读取及自动工作；时间由调用方生成。 |
| `app/api/sessions/[id]/route.ts` | PATCH 比较实际被允许保存的正文/提纲文字，变化时才写 lastStudentActionAt。DELETE 已有调用点经下方 query helper 接入事务。 |
| `app/api/sessions/[id]/actions/route.ts`、`lib/pipeline/retry-review.ts` | 在学生动作接受/回顾重试预留时写学生时间；自动持久化与回顾结果合并不改时间。 |
| `lib/db/queries/sessions.ts` | 删除事务先保全缺失的 attempt marker，再 markPracticeDeleted，再集中 deletePracticeContent；WP4 在集中函数添加正文表。 |
| `app/api/auth/account/route.ts` | 用户删除与用户/邮箱哈希限流键清理在同一事务内；既有外键级联删除全部用户事实与正文。 |
| `lib/pipeline/types.ts`、`lib/pipeline/engine.ts` | 删除 finish 的计划类型与提示词要求；评分、诊断、比较输入不变。 |
| `app/essays/[id]/page.tsx`、`components/essay/session-view.tsx`、`lib/prototype/session-store.tsx` | 服务端读取题库开关，传给结束页；保留不支持会话在 provider 外分派。 |
| `components/essay/finish-summary.tsx` | 不显示历史 planChange，改为确定的“下一步”链接。 |
| `components/essay/essay-topbar.tsx` | “生成学习计划”改为“完成”，仍走同一个 finish 动作。 |
| `components/account/account-settings.tsx` | 删除不存在的计划对象文案，改为练习记录。 |
| `app/(main)/page.tsx`、`app/(main)/layout.tsx` | 题库开启时不再向 NewEssayDialog 传旧重点，避免界面宣称会注入已停用的重点；关闭时不变。 |
| `tests/practice-lifecycle.test.ts`、`tests/question-create-api.test.ts`（新增） | 规则、真实路由、临时库、事务与账户测试。 |
| `tests/ui/finish-summary.test.ts`（新增） | 题目有/无 × 开关开/关四组合的真实组件 HTML。 |
| `tests/learning-flow.test.ts`、`tests/practice-facts.test.ts`、`tests/practice-api.test.ts` | 新 finish 契约、删除证据标记的既有断言调整；后者增加两个自动工作不改变学生时间的接口测试。 |
| `scripts/test-db.ts` | 用正式 deleteSession 测试删除事务，继续覆盖全量迁移、已有库升级、六表保留/账户级联、外键与失效保存。 |
| `docs/plans/reports/WP2c_e2e/`（新增）、本报告 | 可重跑脚本、真实页面 HTML、逐步接口与数据库 JSON、检查日志。 |

没有新增表、依赖或迁移。`lib/pipeline/initial.ts` 保留原创建函数；入口在真实创建时写入学生操作时间，未批量补旧记录。

## 实现要点

1. **创建原子性**：同一 `(user_id, idempotencyKey)` 的参数以固定字段顺序做 SHA-256。先拒绝本包不支持的 quick/mock，再查回执、查询当前题目和创建；整个过程同步运行在 IMMEDIATE 事务。首次 201，重放 200；可支持创建的参数变化返回 409 `idempotency_conflict`；quick/mock 无论是否碰到已有键均优先返回负责人指定错误码。参数不包含未来会变化的当前目录版本，重放不会另建练习。回执写失败时会话、marker、曝光全部回滚。
2. **快照**：仅冻结规范指定的 `{ id, version, exposureKey, bankVersion, primaryTopic, questionType, text }`；prompt 的 id/text/type/主题由快照产生。v2 导入与切换不改已有 JSON。查不到当前记录返回 404；保留题可直接精练。quick 409 `unsupported_activity`，mock 409 `mock_requires_checkpoint`。
3. **重写**：本人来源且 deep、同 exposureKey 才接受；来源不存在/他人来源 404，活动或家族不符 409 `invalid_rewrite`。来源已删除时按 RFC §6 的最小 marker 验证，只新建空白练习，不恢复正文。粘贴来源可经 WP2b resolveAttempt/resolveQuestion 解析家族，仍不补 question。
4. **生命周期**：open → set_aside、set_aside → open、open/set_aside → closed、closed → open；同状态返回原会话，不改版本与时间。closed 直接 setAside 返回 409。变更不写完成表、家族表，不改 stage、评分或完成时间。set_aside/closed 均不删除正文；完成仍可保持 open。
5. **学生时间**：创建、实际正文/提纲文字变化、学生发起动作与生命周期变化记录服务端时间。幂等重放不更新时间。自动 nudge、自动评分/回顾保存、GET/list/页面读取不更新；计时器、提纲来源 metadata、userEdited、偏好开关的 PATCH 不冒充正文编辑。回顾重试只在预留时记录，返回时保留期间其他操作的最新时间。
6. **删除**：会话锁内执行同一数据库事务。集中正文删除函数当前只删 writing_sessions；事实、回执、默认续写关系保留。完成事件仅 evidence_deleted 变 1，日期/资格等字段保留；家族首次提交/反馈事实不丢失，下一次提交为 repeat。删除中触发数据库异常时所有标记与正文一起回滚。
7. **账户清除**：六事实表、会话、认证会话经 users 外键清除；auth_attempts 中 delete/password/model 的用户键及 login/registration 的邮箱键在同一事务清除。其他用户、全局限流、questions 与全局别名表保留。端到端只有一名测试用户且没有全局限流记录，最终全部十张用户相关表为空。

## 验收测试对应

以下均已通过；测试名写明情境，完整输出见 [check-test.log](WP2c_e2e/check-test.log)、[check-test-ui.log](WP2c_e2e/check-test-ui.log)。

| # | 验收情境 | 对应测试与结果 |
|---|---|---|
| 1 | 同键并发/重放一个会话；不同参数冲突 | `question-create-api.test.ts`：`same idempotencyKey concurrent/repeated creates one session, same parameters with reordered keys replay 200; changed parameters 409; users isolated`。8 个并发路由请求恰好 1×201、7×200，只有一个 ID；变更 question/activity/mode/rewrite 均 409；其他用户同键独立。另有 `creation receipt failure rolls back session, marker and exposure together`。 |
| 2 | 题目快照冻结、当前版本 | 同文件：`current question snapshot is frozen across v2 import/current switch; new attempts use v2; missing/noncurrent question 404; reserved allowed`。旧快照七字段完全一致，新建读取 v2；缺题/非当前 404，保留题成功。 |
| 3 | 重写合法/他人/不同家族/非 deep | 同文件：`rewriteOfDeepId: owned same family accepted, other user/missing 404, different family/non-deep 409; deleted source marker still supports blank rewrite`。全部满足，并验证删除来源后不复制内容。 |
| 4 | 生命周期全部转移、幂等、404/409、不改完成事实 | `practice-lifecycle.test.ts`：`lifecycle matrix: open/set-aside close, closed resume, same-state idempotence, closed cannot set aside`；接口：`lifecycle all transitions and same-state idempotence preserve stage, completion and family facts; owner/origin/auth/unsupported guards`。含 quick、未知 stage 409，匿名 401，跨源 403，跨用户 404。 |
| 5 | 编辑/动作更新时间；读取/无变化 PATCH 不更新 | `practice-lifecycle.test.ts`：`student recency: actual draft/outline text and student actions count; reads, automatic nudge/review and metadata do not`，遍历真实 actionSchema 所有动作；接口：`lastStudentActionAt changes on real draft/outline edits and actions, never GET/list, identical PATCH, timer/preferences, ignored draft or replay`。`practice-api.test.ts` 增加 `student review retry stamps recency before calling model; automatic review completion preserves later lifecycle time and state` 与 `automatic paragraph nudge updates its result without changing latest student action time`。打开真实页面的四次渲染前后数据库完全一致（E2E）。 |
| 6 | 删除后 marker/event/familiarity 保留，再提交 repeat | `question-create-api.test.ts`：`deleting completed practice retains exposure/completion with deleted evidence; resubmission is repeat, receipt cannot resurrect; transactional deletion rollback`；现有 `deleting an attempt during optional review retry never recreates content or changes completion`；test:db 六表保留；E2E 删除及 repeat 步骤。 |
| 7 | 账户删除全部用户数据 | `account deletion clears every user table including six facts and hashed user auth limits; catalog and another user's data survive`。真实密码校验与 Cookie DELETE；对全部用户表逐表断言，另核对用户哈希限流键。test:db 级联与外键；E2E 最终十表为空、38 题仍在。 |
| 8 | 题库开关、旧重点、quick/mock 边界 | `question-bank switch: disabled question create 403, legacy task keeps focus and pasted marker; enabled task focus null; quick/mock rejected regardless quick flag`。验证关闭时旧创建仍 201/保留重点，粘贴 marker 家族匹配且 question_id 为空；开启时 focus 为 null。 |
| 9 | finish 无计划、下一步两类链接 | `creation schema distinguishes strict question and legacy bodies; finish strips retired planChange`；原 `complete practice retains work, checks evidence, compares both drafts and saves feedback` 增加真实 finish 结果无 planChange；四个 `finish 下一步: bank=..., question=...` UI 测试同时证明旧 planChange 不展示；E2E 验证模型 finish 与真实结束页链接。 |
| 10 | 原有测试全部通过 | 单元/接口 83/83（原有 69 + 新增 14），UI 19/19（原有 15 + 新增 4），数据库 4 组 PASS。原断言调整逐条见下节。 |
| 11 | 临时库端到端 | [e2e.log](WP2c_e2e/e2e.log)、[steps-and-database.json](WP2c_e2e/steps-and-database.json)、[summary.json](WP2c_e2e/summary.json)，18 次真实路由调用、4 次真实页面 SSR，详见下节。 |

## 端到端步骤与证据

采用负责人允许的 WP2b 进程内路由与页面渲染方式，无端口监听；没有声称执行浏览器点击、hydration 或截图验证。真实 Next 请求上下文、Cookie、路由、SQLite 与 React 页面组件全部运行，只替换网络 fetch 为可控假响应。临时库由脚本自行创建，结束后删除，不依赖应用环境的数据库路径。

复跑命令（仓库根目录）：

```sh
LLM_API_KEY='' node --conditions=react-server --import tsx docs/plans/reports/WP2c_e2e/verify.mjs
```

| 步骤 | 接口/页面 | 验证与证据 |
|---|---|---|
| 1 | POST /api/sessions | 按题目创建 201；重复同键 200；一个会话、marker、receipt，快照一致。 |
| 2 | PATCH + startWriting | 保存完整作文，进入 writing；库中正文一致。打开真实 EssayPage 后库不变；[writing.html](WP2c_e2e/writing.html)、[writing-render.json](WP2c_e2e/writing-render.json)。 |
| 3 | lifecycle setAside | 200，set_aside；stage 仍 writing，正文保留、完成事件为空。 |
| 4 | lifecycle resume | 200，open；stage 仍 writing，原会话 ID 不变。 |
| 5 | evaluate + GET + finish | 假评分成功保存完成事件；完成时仍 open；GET 不改学生时间；finish 无 planChange。请求记录 [model-fixtures.json](WP2c_e2e/model-fixtures.json)，没有真实模型调用。 |
| 6 | 结束页 HTML | 有 question + 题库开 → `/topics/education`：[finished-topic.html](WP2c_e2e/finished-topic.html)；同会话题库关 → `/`：[finished-bank-off.html](WP2c_e2e/finished-bank-off.html)；无 question + 题库开 → `/`：[finished-pasted.html](WP2c_e2e/finished-pasted.html)。各有同名 render.json。无题目案例以旧入口创建，再安装相同结束数据作页面夹具；主链路结束数据来自真实 finish 路由。四次页面渲染前后数据库完整比较相等。 |
| 7 | lifecycle close | 200，closed；stage 仍 finished，完成事件逐字段不变。 |
| 8 | DELETE /api/sessions/{id} | 200，正文消失；marker.deleted_at 有值、event.evidence_deleted=1、家族记录仍在。旧创建键重放 409，不复活正文。 |
| 9 | 同题另建并提交 | 新键 201，写作后评分返回 originalFreshness=repeat。 |
| 10 | DELETE /api/auth/account | 200；用户、认证、限流、会话和六事实表全空；38 道目录题保留。 |

每一步的响应与数据库快照均在 [steps-and-database.json](WP2c_e2e/steps-and-database.json)；合成用户的密码/token 哈希在证据快照中脱敏。脚本：[verify.mjs](WP2c_e2e/verify.mjs)、[render.mjs](WP2c_e2e/render.mjs)。

## 命令结果

| 命令 | 最终结果 | 日志 |
|---|---|---|
| `npm run lint` | 退出 0，零 warning | [check-lint.log](WP2c_e2e/check-lint.log) |
| `npm run typecheck` | 退出 0，路由类型生成与 tsc 通过 | [check-typecheck.log](WP2c_e2e/check-typecheck.log) |
| `npm test` | 退出 0，83/83，0 失败/跳过 | [check-test.log](WP2c_e2e/check-test.log) |
| `npm run test:ui` | 退出 0，19/19，0 失败/跳过 | [check-test-ui.log](WP2c_e2e/check-test-ui.log) |
| `npm run test:db` | 退出 0，空库迁移/重放、已有库升级、删除保留事实、所有者/账户级联/外键四组 PASS | [check-test-db.log](WP2c_e2e/check-test-db.log) |
| 离线 E2E 命令 | 退出 0，18 次接口、4 次真实页面 SSR | [e2e.log](WP2c_e2e/e2e.log) |
| `git diff --check` | 退出 0 | [check-diff.log](WP2c_e2e/check-diff.log) |

开发首轮新测试有两类夹具错误：合成 Cookie token 未满足 64 位十六进制格式，导致新接口测试认证失败；遍历 Zod 字面量时错用 enum 的 options，导致规则测试与 typecheck 失败。修正 token 为哈希、分别读取 literal.values/enum.options 后通过。最终日志中的 `Request failed: test scan write failure` 是既有注册测试的预期故障注入，不是漏修失败。

## 原有测试调整及原因

1. `tests/learning-flow.test.ts`：假 finish 输出删除 planChange，另断言实际结果不含该字段；完整学习流程、finish 重放不重复调用等原断言保留。
2. `tests/practice-facts.test.ts`：仅删除 fake finish 输出中的 planChange；完成事件不移动/不重复的原断言保留。
3. `tests/practice-api.test.ts`：finished 阶段夹具删除 planChange。删除期间回顾返回的测试，原“全部 completionEvents 完全不变”改为“仅被删除会话的 evidenceDeleted=true，其他字段与其他事件完全不变”，因为 WP2c 正式接入删除标记。另新增两个 recency 接口测试；未放开原稿重评入口，WP2b R1 的所有阶段拒绝断言保持通过。
4. `scripts/test-db.ts`：替换手工 mark + SQL delete 为正式 deleteSession，确保测到交付的集中事务；deleted_at 不再要求等于测试手工传入的 now（生产函数使用真实删除时间），改为检查已写入。六事实表保留、数据不含私密正文、账户级联、外键与失效保存断言保留。

## QB-11 删除的计划残留与 G-01

已删除/替换：finishSchema.planChange、SessionState.finish.planChange、模型 finish 的下次计划要求、结束小结的模型计划展示、“生成学习计划”按钮文字、账户删除说明中不存在的“计划”对象。

`components/shell/new-essay.tsx` 已核对，无计划链接；关闭开关时仍保留旧创建行为。题库开启时，首页和侧栏不再给该组件传旧重点，API 也不再注入。仓库运行时页面/组件不存在指向 `/plan` 的入口；旧 `/plan` 只有到 `/progress` 的兼容重定向，保留该重定向。历史原型文档与未被页面使用的 `PLAN_TASKS` / `PLAN_CHANGES` fixture 不作为产品入口删除，不同步改写历史文档。已有 JSON 里的旧 planChange 作为兼容未知字段保留，不再展示，不做批量迁移。

finish 提示词前后差异（context 参数与 memoryChanges 要求不变）：

```diff
-Summarize this student's actual learning evidence and a concrete next-session practice plan. Memory claims must be supported by this session; recurring only if prior session evidence matches. Do not claim stable ability improvement from a single revision. Use 2–5 brief memoryChanges. The planChange must explain a focused next practice, not claim external calendar actions happened.
+Summarize this student's actual learning evidence. Memory claims must be supported by this session; recurring only if prior session evidence matches. Do not claim stable ability improvement from a single revision. Use 2–5 brief memoryChanges.
```

G-01：engine.ts 的 evaluate/compare 整段与 HEAD 字节一致，包括评分/诊断提示词和输入；[g01-check.txt](WP2c_e2e/g01-check.txt) 记录校验与 SHA-256。只去掉 finish 中两处同属 planChange 的计划要求，没有改变评分/诊断。完成事件仍在必需原稿反馈提交时产生，finish 失败不影响完成。

## 疑问与保守处理

以下是未明确规定的响应细节，提交负责人审阅；没有引入新的推荐或资格产品规则。

| 问题 | 候选方案 | 本包暂行保守做法 |
|---|---|---|
| 已删除会话的创建键重放无法再返回会话正文 | A. 重建；B. 返回墓碑；C. 拒绝且保留回执 | C：409 `practice_deleted`，要求新键另开；防止意外复活或借重放抹去删除。没有定义新的墓碑响应结构。 |
| closed 收到 setAside，不在指定转移中 | A. 直接设为搁置；B. 自动恢复再搁置；C. 拒绝 | C：409 `lifecycle_conflict`，先由学生显式 resume。 |
| 同状态生命周期请求是否也刷新学生时间 | A. 每次刷新；B. 完全幂等 | B：同状态不写任何字段，避免重放改变推荐顺序。实际生命周期变化才记录学生时间。 |
| rewriteOfDeepId 来源正文已删除，但 RFC §6 明确允许删除来源后的同题空白重写 | A. 必须有正文而拒绝；B. 用 retained marker 验证关系 | B：按 RFC 验证本人、deep、同 exposureKey；不恢复或读取已删除正文。现存来源优先读取真实会话，防止旧 marker 掩盖活动/家族不匹配。 |
| 自动 nudge 也使用 /actions；偏好/计时 PATCH 不是正文编辑 | A. 所有 HTTP 写入均刷新；B. 按真实发起方式与实际文字变化区分 | B：自动 nudge 不计，dismissNudge 与显式 retryReview 等学生动作计入；PATCH 只有正文/提纲文字实变才计入。符合 RFC 稳定排序，不给偏好/计时保存编造写作编辑时间。 |

## 未完成事项与范围边界

- 无未完成的 WP2c 编码项或指定自测；等待负责人代码审阅和验收，不提交。
- `/topics/{primaryTopic}` 在 WP6 实现，本包只输出链接；不新建主题页、推荐器或生命周期按钮。
- quick 创建、卡片/检查结果/操作输入删除分别留给 WP4a；集中删除函数已留扩展点。mock 检查点入口留给 WP7。
- 生命周期不额外改变 stage，也没有自行禁止 set_aside/closed 的既有编辑接口或把编辑当自动 resume；后续页面动作由相应工作包处理。
- 未运行浏览器交互/视觉截图验证；依授权采用真实路由 + 页面 SSR，所验证范围与证据已明确。未运行 build（本包要求的五项命令全部完成，build 为 WP8 的额外检查）。

## 负责人验收（2026-11-01，Claude Code）

**结论：通过。**

1. 代码审阅：按题目创建在一个 `IMMEDIATE` 事务内完成回执查询、题目读取、快照冻结、会话与 marker 写入、回执写入；生命周期由纯函数决定转移，锁内执行；删除在同一事务内补 marker → 写删除标记 → 删正文，正文删除集中在 `deletePracticeContent` 供 WP4 扩展；`lastStudentActionAt` 只在正文 / 提纲文字实变、学生动作与生命周期变化时写。`finish` 提示词只删除计划要求，评分与诊断段与 HEAD 一致（`g01-check.txt`）。账户删除同时清除该用户的限流记录，属“所有相关表为空”的必要配套，接受。
2. 疑问的决定：已删除会话的创建键重放返回 `409 practice_deleted`（C）；`closed` 上的 `setAside` 返回 `409 lifecycle_conflict`（C）；同状态请求完全幂等（B）；重写来源已删除时用保留的 marker 验证（B）；自动 nudge 与偏好 / 计时保存不算学生操作（B）。均同意。
3. 测试证据（由实现者完成）：五项检查 83/83、19/19、4 组 PASS，负责人重跑确认；端到端 18 次真实路由调用、4 次页面渲染：创建 → 写作 → 搁置 → 恢复 → 关闭 → 删除各步数据库状态正确，账户删除后 10 张用户相关表为空、题库 38 题保留；结束页“下一步”在有题目且题库开时指向 `/topics/education`，题库关或粘贴题时指向 `/`。
