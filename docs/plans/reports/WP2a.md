# WP2a 实现与自测报告（QB-04、QB-12）

日期：2026-11-01。分支：`question-bank-0.4`。本包编码及指定自动化检查已完成，待负责人验收。

未 commit、切分支或 push；未联网、增加依赖或调用真实模型。数据库验证全部使用临时目录/内存库，未打开或改写真实应用数据库。开工时已有的 `docs/plans/tasks/WP2a_prompt.md` 未改动。

## 已读依据

- 根 `AGENTS.md`；开发方案第 3 节、第 4 节 WP2a；90 §4.1；RFC §9；WP1 报告末尾负责人验收记录。
- 本地 Next.js 指南：App Router `layouts-and-pages`、`route-handlers`、`server-and-client-boundary`，以及环境变量指南相关部分。
- 会话类型、创建/查询/保存/锁/动作流程；全部会话 API、两条作文页面路径；`SessionProvider`、`components/essay/` 与现有单元、UI、数据库测试。

## 改动文件

| 文件 | 改动 |
|---|---|
| `lib/pipeline/types.ts` | 增加 90 §4.1 全部 12 个新字段；题目快照复用 WP1 目录字段类型；卡片快照暂为不透明对象，见“疑问”。 |
| `lib/prototype/types.ts` | `Stage` 增加 `quick`。 |
| `lib/pipeline/read-session.ts` | 新增纯函数 `readSession(json)` 和共享支持判断 `isSupportedSession`。 |
| `lib/db/queries/sessions.ts` | `getSession`、`listSessions` 统一经过读取适配器；真实保存时升级到 schema 2，不降低未来版本号。 |
| `lib/pipeline/initial.ts` | 新会话为 schema 2 / Deep / open，其余新增字段均为 null。 |
| `lib/pipeline/http.ts` | 共享 HTTP 断言；不支持时返回 409、`code: "unsupported_session"`，保留中文 `error`。 |
| `lib/pipeline/engine.ts` | 仅给 `SessionError` 增加可选 code；评分、诊断、模型提示与动作业务逻辑未改。 |
| `app/api/sessions/[id]/route.ts` | PATCH 在解析输入前、锁内写入前检查支持状态；保留提纲与计时对象的未知字段。 |
| `app/api/sessions/[id]/actions/route.ts` | 所有动作在解析输入前、锁内去重及 pendingAction 写入前检查支持状态。 |
| `lib/pipeline/outline.ts` | 提纲 PATCH 合并保留已存扩展字段；非空槽位编辑保留槽位扩展字段。清空槽位仍按原行为设为 null。 |
| `app/essays/[id]/page.tsx` | 认证及所有者查询之后交给服务端 `SessionView` 分派。 |
| `components/essay/session-view.tsx` | 支持的会话沿用原 `SessionProvider` + `EssayScreen`；其他会话直接返回只读组件。 |
| `components/essay/readonly-session.tsx` | 显示题目、原稿/改写稿、不同的已提交正文、提纲、对话和引用；仅有返回作文库链接，无编辑器、作文动作、计时或自动保存。 |
| `lib/config/features.ts` | 服务端运行时 `readFeatures(env = process.env)`，四开关默认关闭，仅字面量 `true` 开启；Quick / checkpoints 依赖题库开关。未接入新功能。 |
| `.env.example` | 四个环境变量，默认全部 false。 |
| `原型/90_共享规范.md` | 只补充 question 行“旧记录读取时”一格：别名解析属于 WP2b 扫描，读取缺失值为 null。 |
| `tests/helpers/legacy-session.ts` | 无 schemaVersion 的旧 JSON fixture，含顶层及多层嵌套未知字段。 |
| `tests/helpers/request-context.ts` | 本地 Next 请求上下文，用真实 Cookie 认证直接执行 Route Handlers，无网络监听；补上 Next 构建器通常提供的服务端 navigation 别名。 |
| `tests/session-compat.test.ts` | 4 项兼容读取、新建默认值、幂等、支持判断测试。 |
| `tests/features.test.ts` | 3 项默认值、组合矩阵、运行时环境读取测试。 |
| `tests/session-api.test.ts` | 7 项真实临时 SQLite / Route Handler 测试，覆盖读取无写入、保存往返、接口拒绝、旧行为及认证隔离。 |
| `tests/ui/session-view.test.ts` | 6 项静态渲染/组件分派测试，覆盖 Quick/未知类型只读和旧组件保留。 |
| `docs/plans/reports/WP2a.md` | 本报告。 |

未改 `app/sessions/[id]/page.tsx`：保留原有重定向到 `/essays/[id]`，最终经过同一分派。未改数据库表或迁移、冻结题库、依赖文件、锁实现及原有测试文件。

## 兼容读取与写入边界

1. 无 `schemaVersion` 视为 1，v1/v2 共用缺失字段默认值。读取保留原 schemaVersion；仅下一次真实 `saveSession` 才把旧版本写成 2。未来版本号不降级。`version` 仍是原有乐观锁版本。
2. 保留原对象及其嵌套结构，不对存储 JSON 做会剥离字段的 schema parse。默认值仅填缺失字段，不覆盖已有快照、生命周期或时间。
3. 缺失 activity 为 deep；缺失 lifecycle 在 finished 时为 closed，其他为 open。question 和全部新增时间/来源/快照字段缺失为 null。不查别名、不查事件表、不借用 updatedAt、不在读取时写库。
4. 新建仅写指定初值。未实现 lastStudentActionAt、完成时间、生命周期转换等后续业务写入；既有 savedAt/updatedAt 的真实保存行为保留。
5. 本包仅支持 `activity = deep` 且 stage 为原有八种作文阶段。Quick activity、Quick stage、未知 activity/stage 均只读；开关值不改变本包的支持集合。
6. 接口保护早于去重回执、版本冲突判断、pendingAction 写入及模型准入。旧页面重放成功过的请求也不能绕过保护；未知动作名称同样返回 409。锁内再次读取并检查，覆盖读请求体期间的状态变化。
7. HTTP 顺序仍先查同源和认证；他人/不存在资源为 404。响应格式为 `{ error: "中文说明", code: "unsupported_session" }`，并带 `Cache-Control: no-store`。本包未改变 GET 和 DELETE 的既有授权语义；生命周期、删除记录保留规则属于 WP2c。
8. 为避免真实保存丢失嵌套扩展字段，额外处理了 PATCH 的提纲和计时对象；未知字段来自已存记录，不能通过 PATCH 注入未经校验的新字段。原有提纲清空语义保持不变。

## 验收测试对应

以下全部通过。API 测试随 `npm test` 执行，使用真实 Route Handlers、真实临时 SQLite 和 Cookie 认证，不是仅测试支持判断函数。

| 验收要求 | 对应测试 | 验证结果 |
|---|---|---|
| 1. 旧 JSON 读取 → 保存 → 再读，默认值及未知字段正确 | `session-compat.test.ts`：`legacy reader adds only compatibility defaults and preserves all unknown fields without inventing times`；`session-api.test.ts`：`legacy get/list are read-only; real save upgrades to v2 and round-trips nested unknown fields` | 顶层 false、嵌套对象/数组/null、prompt、outline、slot、reason、counter、drafts、elapsed 扩展均保留。get/list 前后整张会话表逐字节一致；真实保存后为 v2。新时间不编造，finished 默认 closed。 |
| 2. v2 幂等 | `session-compat.test.ts`：`v2 reading is idempotent and preserves recorded snapshots, lifecycle and timestamps` | 有实际快照、来源、set_aside、所有时间的 v2 原值不变；再读 deepEqual。也覆盖未来值/版本保存不被降级。 |
| 3. Quick 只读；PATCH/动作 409 且记录不变 | `session-api.test.ts`：`Quick activity: GET succeeds; PATCH and every action reject with 409 and zero database changes`、对应 `Quick stage` 测试；`ui/session-view.test.ts`：对应 `Quick activity`、`Quick stage` 两项 | 覆盖全部现有动作（含原稿及改写评估）、未知动作、重复 requestId、过期 version、未知 PATCH 输入和 busy 锁；均 409/code 正确，每次拒绝后整张会话表及时间逐字节不变，无模型调用。只读 HTML 显示已有文字，无 button/textarea/input/form。 |
| 4. 未知 stage 同上 | API/UI 中对应 `unknown stage` 测试；另外有 `unknown activity` 两组测试 | 未知 stage 即使 activity 为 deep 仍拒绝；未知 activity 即使 stage 为 writing 仍拒绝。不会挂载 SessionProvider。 |
| 5. 开关默认全关，子开关依赖题库 | `features.test.ts`：`features default off and only literal true enables a flag`、`Quick and checkpoints require the question bank; focus is independent`、`feature reader reads the runtime environment` | 缺省全 false；题库未设置/false 时 Quick/checkpoints 均 false；组合矩阵及 FOCUS 独立读取通过。 |
| 6. 旧作文/Deep 正常打开、编辑、动作，原测试保留 | `session-api.test.ts`：`legacy and Deep GET, editing, actions and idempotency retain existing behavior`；UI：`legacy and Deep sessions retain the original provider and EssayScreen`；原 `agent`、`learning-flow` 等全部测试 | GET 不写库；真实 PATCH 更新正文、提纲、计时并保留未知字段；startWriting 成功；PATCH/动作重放不再次写入；过期版本仍 409。原 27 项单元测试、5 项 UI 测试及数据库回归全部通过。 |

额外覆盖：

- `new sessions start at v2 Deep/open with null evidence and provenance`、`support requires Deep and an existing essay stage, never Quick or unknown values`。
- `unsupported guard preserves authentication, origin checking and owner isolation`：无效 Cookie 401、另一真实用户访问已有 Quick 的 GET/PATCH/POST 均 404、跨源 PATCH 403，记录不变。
- `read-only view prefers the frozen question and tolerates absent essay-only fields`：优先显示题目快照，不要求 Quick 具备作文的提纲/草稿结构。

**原有测试调整：无。** 没有删除、放宽或替换任何原有断言。

## 命令结果

执行环境：Node v25.8.2，npm 11.11.1；未安装或切换运行时。

| 命令 | 最终结果 |
|---|---|
| `npm run lint` | 退出 0，零 warning。 |
| `npm run typecheck` | 退出 0，路由类型生成及 `tsc --noEmit` 通过。 |
| `npm test` | 退出 0，41/41 通过（原 27 + 本包 14）。 |
| `npm run test:ui` | 退出 0，11/11 通过（原 5 + 本包 6）。 |
| `npm run test:db` | 退出 0，原 3 组 PASS：空库迁移、旧库升级不改数据、所有者隔离/级联/迟到写入/外键。 |
| `git diff --check` | 退出 0。 |

实现期间新增 API 测试首次运行遇到 Node 直接加载 `next/navigation` 的客户端入口与 `react-server` 条件不兼容；已在测试辅助模块按 Next 构建器行为映射到其服务端入口，未修改生产认证代码或模拟认证返回值。请求上下文的配置类型也按当前本地 Next 版本补齐，最终五项检查均重跑通过。

## 疑问

| 问题 | 候选方案 | 暂时采用的最保守做法 |
|---|---|---|
| 90 将 `cardSnapshot` 指向 13 §7，但那里仅规定“内容、来源、检查状态、版本”，未定义冻结快照的完整序列化键名。 | A. WP2a 提前确定完整结构；B. WP2a 将其视为不透明对象，由 WP4a 明确结构并增加读取/呈现。 | 采用 B：类型为 `Record<string, unknown> \| null`，缺失 null，已有值原样保留；不猜键名、不写快照、不解析新表。只读外壳显示当前会话已知的文字字段。WP4a/WP8 需要用真实卡片结构补齐卡片只读与回滚演练，不应将本报告视为卡片回滚已验收。 |

负责人已经明确的 question 别名解析、lastStudentActionAt、completedAt、lifecycle 和支持判断规则均按本次指令执行，无待确认阻塞项。

## 未完成事项与验证边界

- 无遗漏的本包编码项或指定自动化命令；未开始 WP2b 及后续业务写入，也未启用任何新功能。99 清单由负责人验收后更新，本包未打勾。
- UI 验证采用项目现有 `renderToStaticMarkup` 方式，并直接检查分派组件类型；未执行真实浏览器的手动打开/输入、截图或端到端交互验收。旧编辑路径的服务端行为由真实接口测试及原学习流程测试覆盖，浏览器人工验收仍交负责人执行。
- 未运行 build（不在本包指定五项命令中），未在 Node 24.x 上另跑；与 WP1 验收记录相同，声明版本复测留给 WP8。

## 负责人验收（2026-11-01，Claude Code）

**结论：通过。**

1. 阅读全部改动，对照 90 §4.1 读写规则 1–7 与开关表、方案第 3 节约定：`readSession` 纯函数、保留未知字段、只在真实保存时升级；支持判断由页面与接口共用，在锁外与锁内各检查一次；开关默认关闭且依赖关系正确；评分与诊断未改。`mergeOutline` / `setSlot` 保留扩展字段属于“写回时原样保留”的必要配套，接受。
2. 重跑五项检查：`lint`、`typecheck`、`npm test` 41/41、`test:ui` 11/11、`test:db` 3 组 PASS。
3. 浏览器验收（临时数据库，独立开发服务器，未碰 `data/app.db`）：
   - 无 `schemaVersion` 的旧会话（含未知字段 `futureField`）在原编辑器中打开，外观与改动前相同；输入文字自动保存后，记录升级为 `schemaVersion = 2`，`futureField` 原样保留。
   - `activity = quick` 的会话显示只读视图（题目、已有对话，无编辑器与按钮）。
   - 对该会话的草稿 `PATCH` 与 `startWriting` 动作均返回 `409 unsupported_session`，记录的 `version` 与正文不变。
4. 疑问的决定：`cardSnapshot` 暂为不透明对象，由 WP4a 定义结构并补卡片只读视图，同意（采用 B）。
