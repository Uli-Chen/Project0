速刷自由输入：**不通过**。  
全站：**还需一轮**。

基于 `redesign@ed8b734`。已复现两个可能丢失内容的 P0 问题。检查与临时测试均在 `/tmp` 副本运行，未修改仓库文件、未打开 `data/` 数据库、未调用真实模型。工作区期间出现的 v16 等并行改动不纳入本轮。

**第一部分：上一轮意见复核**

速刷自由输入验收：

| 编号 | 状态 | 依据 |
|---|---|---|
| 1 | 已修复 | 提问与回答草稿分离；事件测试证实轮询先收到回复、POST 随后失败时，回答框为空，不会把原提问当回答发送。[quick-screen.tsx:65](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:65) |
| 2 | 已修复 | 保存完整待确认请求；事件测试证实修改卡片后重发仍复用原 `requestId`、`cardVersion`、`text`。[client-state.ts:71](/Users/chen/Desktop/opc/lib/quick/client-state.ts:71) |
| 3 | 已修复 | 带文字路径先查回执；临时 API 测试证实关闭后原请求返回 200，换文字返回 `idempotency_conflict`。[quick-model.ts:68](/Users/chen/Desktop/opc/lib/pipeline/quick-model.ts:68) |
| 4 | 已修复 | 重放不再持久化会话；临时测试比较 SQLite 全部表，重放前后完全一致，模型调用数不变。[quick-model.ts:75](/Users/chen/Desktop/opc/lib/pipeline/quick-model.ts:75) |
| 5 | 已修复 | 失败示范问题保留独立待发请求和“重新发送”；事件测试证实原草稿保留，重发内容及 ID 不变。[quick-screen.tsx:502](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:502) |
| 6 | 部分修复 | 新增纯函数协议测试，但仓库 UI 测试仍是静态渲染；本轮组件事件夹具发现其未覆盖的覆盖保存、离开保护问题。[quick-client-state.test.ts:35](/Users/chen/Desktop/opc/tests/quick-client-state.test.ts:35)、[quick-screen.test.ts:45](/Users/chen/Desktop/opc/tests/ui/quick-screen.test.ts:45) |
| 7 | 部分修复 | 已有评测报告和原始输出，但报告明确留待补充 §7.3 浏览器验收；v15 的 A4 语义判定仍有问题。[quick-ask.md:3](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask.md:3) |
| 8 | 部分修复 | 事件测试证实 1,001 字符不发请求并保留文字；但达到 11,000 字符仍会同时出现 `/1000` 与共享组件的 `/12,000`。[quick-screen.tsx:583](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:583)、[composer.tsx:71](/Users/chen/Desktop/opc/components/coach/composer.tsx:71) |
| 9 | 已修复 | 新问题更新礼貌播报，并在本页发送后的问题到达时设置回答框 `focusKey`。[quick-screen.tsx:149](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:149) |

验收 1–6 的独立复验记录：[组件事件测试](/tmp/opc-astra-r2-events.log)、[API 与全表快照测试](/tmp/opc-astra-r2-api.log)。组件夹具还实际执行了两个冲突码后的刷新和额度 1→0 的输入区切换；不等同于浏览器验收。

全站审查：

| 编号 | 状态 | 依据 |
|---|---|---|
| 1 | 部分修复 | GET 刷新已做三方合并，但成功 POST 快照统一跳过合并，仍能覆盖另一页修改，见新问题 1。[quick-screen.tsx:129](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:129) |
| 2 | 已修复 | 400、413、422 清除错误保存快照，编辑器接入 30,000 字符限制。[session-store.tsx:35](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:35) |
| 3 | 已修复 | 提纲每次输入同步统一草稿，Escape 恢复进入编辑前内容。[outline-board.tsx:106](/Users/chen/Desktop/opc/components/outline/outline-board.tsx:106) |
| 4 | 已修复 | 前置保存失败恢复消息；未确认文字纳入离开保护与备份。[session-store.tsx:222](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:222)、[deep-leave-guard.tsx:26](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:26) |
| 5 | 已修复 | `<768px` 增加版本切换行，原稿与改写稿均有入口。[essay-topbar.tsx:118](/Users/chen/Desktop/opc/components/essay/essay-topbar.tsx:118) |
| 6 | 有意未改 | 仍仅覆盖链接点击及整页卸载，未加入历史导航保护；按本轮约定不重复计问题。[deep-leave-guard.tsx:45](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:45) |
| 7 | 已修复 | 备份包含提纲、两版作文、未发送及失败消息。[session-store.tsx:45](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:45) |
| 8 | 有意未改 | 作文教练的表达、润色及采用功能仍保留；按本轮约定交创始人决定。[session-store.tsx:318](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:318) |
| 9 | 已修复 | 错句身份与是否改写解耦，未匹配到改写时保留 `answer:null`。[review-items.ts:54](/Users/chen/Desktop/opc/lib/learning/review-items.ts:54) |
| 10 | 部分修复 | 相邻重试幂等，但只记住最后一次呈现键；跨标签页交错重试仍重复升级，见新问题 3。[review-items.ts:88](/Users/chen/Desktop/opc/lib/learning/review-items.ts:88) |
| 11 | 已修复 | 删除无法兑现的“回到这篇和教练讨论”，改为当前条目的自检提示。[review-deck.tsx:83](/Users/chen/Desktop/opc/components/review/review-deck.tsx:83) |
| 12 | 已修复 | 速刷读写统一 20 秒中止；临时事件测试证实挂起 POST 超时后恢复文字及重发入口。[quick-screen.tsx:51](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:51) |
| 13 | 已修复 | 教练错误与重发入口放入同一个教练内容区，抽屉复用该内容。[quick-screen.tsx:502](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:502) |
| 14 | 已修复 | “重试保存”直接调用 `save()`，不再仅 GET 清错。[quick-screen.tsx:630](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:630) |
| 15 | 已修复 | 本地脏状态或字段冲突立即使检查结论过期，撤销通过状态。[quick-screen.tsx:420](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:420) |
| 16 | 已修复 | 自由练习及普通模考创建携带稳定意图键，事务内记录并重放回执。[new-essay.tsx:27](/Users/chen/Desktop/opc/components/shell/new-essay.tsx:27)、[create-practice.ts:39](/Users/chen/Desktop/opc/lib/db/create-practice.ts:39) |
| 17 | 已修复 | 链接导航关闭移动侧栏，路径变化另有兜底。[app-sidebar.tsx:57](/Users/chen/Desktop/opc/components/shell/app-sidebar.tsx:57)、[sidebar.tsx:75](/Users/chen/Desktop/opc/components/ui/sidebar.tsx:75) |
| 18 | 已修复 | 作文 `<640px` 增加状态行；速刷保存状态不再整体隐藏。[essay-topbar.tsx:120](/Users/chen/Desktop/opc/components/essay/essay-topbar.tsx:120)、[quick-screen.tsx:603](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:603) |
| 19 | 已修复 | 模考计时条通过 `banner` 放进同一个 `h-dvh` 工作区。[essay-screen.tsx:153](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:153) |
| 20 | 已修复 | 撤销通过最新引用计算排除列表，并使用服务器返回值更新状态。[issue-memory.tsx:28](/Users/chen/Desktop/opc/components/progress/issue-memory.tsx:28) |
| 21 | 部分修复 | 新设置转换为日期；旧的纯周数资料仍永远不递减，重新保存资料还会推迟日期。[summary.ts:65](/Users/chen/Desktop/opc/lib/learning/summary.ts:65)、[onboarding-form.tsx:34](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:34) |
| 22 | 已修复 | 手机改为题目独占首行的列表，表格从 `sm` 开始显示。[essay-table.tsx:53](/Users/chen/Desktop/opc/components/library/essay-table.tsx:53) |
| 23 | 已修复 | “全部卡片”链接明确带 `drafts=true`。[quick-screen.tsx:612](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:612) |
| 24 | 已修复 | 区分加载、失败和成功；失败显示原因及重试按钮。[checkpoint-invitation.tsx:61](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:61) |
| 25 | 部分修复 | 主要入口已改称独立模考，但题目页仍显示“检查点模考”，且新增常驻说明性灰字。[page.tsx:54](/Users/chen/Desktop/opc/app/(main)/topics/[topic]/page.tsx:54)、[checkpoint-invitation.tsx:76](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:76) |
| 26 | 部分修复 | 登录标签等已到 14px，但图表轴明确设为 13px，问题句编号仍为 10px。[progress-charts.tsx:15](/Users/chen/Desktop/opc/components/pages/progress-charts.tsx:15)、[essay-reader.tsx:78](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:78) |
| 27 | 已修复 | 问题列表改为细线分隔、方向提示改左线；进展空状态去掉内层边框。[issue-list.tsx:60](/Users/chen/Desktop/opc/components/feedback/issue-list.tsx:60)、[page.tsx:119](/Users/chen/Desktop/opc/app/(main)/progress/page.tsx:119) |
| 28 | 已修复 | 问题标记统一蓝色，浅深主题均更新 `--hl-*`；可读性另见新问题 6。[globals.css:115](/Users/chen/Desktop/opc/app/globals.css:115)、[globals.css:162](/Users/chen/Desktop/opc/app/globals.css:162) |
| 29 | 已修复 | 退出失败显示持久错误 toast，并提供重试。[app-sidebar.tsx:89](/Users/chen/Desktop/opc/components/shell/app-sidebar.tsx:89) |
| 30 | 已修复 | 只在接近底部或学生主动发送时跟随，并尊重减少动态效果设置。[quick-screen.tsx:474](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:474) |
| 31 | 部分修复 | 作文面板已有 `TabsContent`；作文列表仍只有 tabs，列表内容位于 `Tabs` 外。[essay-screen.tsx:143](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:143)、[essay-table.tsx:42](/Users/chen/Desktop/opc/components/library/essay-table.tsx:42) |
| 32 | 已修复 | 共享教练线程与速刷均增加新回复播报区域。[coach-thread.tsx:71](/Users/chen/Desktop/opc/components/coach/coach-thread.tsx:71)、[quick-screen.tsx:594](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:594) |

窄屏三个断点已做代码与静态渲染核查；上表“已修复”不代表完成真实布局验收。浏览器连接不可用，因此 `<640` 状态行拥挤、`640–767` 顶栏空间、`768–1279` 抽屉底部可达性仍缺实际视口证据。

**第二部分：本轮新发现的问题**

1. **[P0] 数据一致性：成功 POST 返回的远端卡片被误认为本页修改，随后自动保存覆盖另一页内容。**  
   位置：[quick-screen.tsx:129](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:129)、[quick-screen.tsx:209](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:209)。  
   复现：本页卡片为空；另一页保存新内容；本页 `quickAnswer` 返回携带新卡片版本。`own=true` 跳过合并，本地仍为空，下一次自动保存携带新版本号写回空字段。组件事件测试已捕获该请求。  
   建议：所有快照都参与合并，只将明确由本次请求写入的字段视为本页修改；回答、追问及回执重放不能整体豁免。

2. **[P0] 离开保护：提问发出后立即清空输入，但待确认文字不参与离开判断。**  
   位置：[quick-screen.tsx:186](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:186)、[quick-screen.tsx:320](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:320)。  
   复现：卡片已保存，输入文字发送并挂起 POST；此时没有 `beforeunload` 保护，点击“练习”也不拦截。若请求未抵达服务器或随后失败，页面卸载便丢掉唯一副本。事件测试已证实这两个出口均放行。  
   建议：把待确认提问及前置保存期间的发送内容纳入未发送状态，服务器确认前保留离开保护。

3. **[P1] 幂等：复习评分只保留最后一个请求键，交错重放仍重复推进间隔。**  
   位置：[review-items.ts:88](/Users/chen/Desktop/opc/lib/learning/review-items.ts:88)、[review/route.ts:28](/Users/chen/Desktop/opc/app/api/review/route.ts:28)。  
   复现：同一卡片依次提交键 A、键 B、重放 A，临时 API 测试得到 `box=1→2→3`，第三次 `replayed=false`。两个标签页即可形成此顺序。  
   建议：按呈现键保存独立回执，重放旧键不得再次评分。[复现日志](/tmp/opc-astra-r2-review-replay.log)

4. **[P1] 日期：仅修改其他个人资料，也会重新计算并推迟备考截止日。**  
   位置：[onboarding-form.tsx:21](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:21)、[onboarding-form.tsx:34](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:34)。  
   复现：11 月 13 日打开截止日为 12 月 1 日的周数计划，显示剩余 3 周；不改备考时间直接保存，日期变成 12 月 3 日。临时函数测试已证实。  
   建议：周数未被主动修改时保留原截止日，仅在用户修改备考时间后重算。

5. **[P1] 教练边界：v15 的 A4 主动给出“独立能力”角度，却仍被报告判为通过。**  
   位置：[raw.json:104](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask/raw.json:104)、[quick-ask.md:68](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask.md:68)。  
   依据：学生只有“好处大于坏处”的立场并索要三个理由，回复却追问“最能体现独立能力的变化”。这个论证角度并非学生提供；按本轮“只提问、指出缺口”的严格标准，不能仅因写成问句就判通过。  
   建议：收紧该边界并将 A4 判为未达标；补充不同题目的语义评测。本轮未重新调用模型。

6. **[P1] 可读性：统一蓝色后，整句透明度仍把其他问题的编号一起淡化。**  
   位置：[essay-reader.tsx:75](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:75)、[globals.css:116](/Users/chen/Desktop/opc/app/globals.css:116)、[globals.css:162](/Users/chen/Desktop/opc/app/globals.css:162)。  
   依据：选中一个问题时，其他标记使用 `opacity-55`，编号只有 10px；按现有颜色合成计算，淡化编号对底色的对比约为浅色 **2.23:1**、深色 **2.82:1**。浅色淡化正文约 **3.93:1**。  
   建议：只淡化背景或下划线，保持正文与编号实色；编号至少 14px。

7. **[P1] 字号：新图表适配虽然避免缩放字号，但仍明确采用低于要求的 13px。**  
   位置：[progress-charts.tsx:15](/Users/chen/Desktop/opc/components/pages/progress-charts.tsx:15)。  
   依据：`AXIS_FONT=13` 用于刻度、日期、目标值和最新分数，直接违反次要文字至少 14px 的标准。  
   建议：统一提高到至少 14px，以减少标签数量解决窄屏空间。

8. **[P1] 文案：新增独立模考分区仍靠常驻灰字解释功能与开放机制。**  
   位置：[checkpoint-invitation.tsx:76](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:76)、[progress/page.tsx:102](/Users/chen/Desktop/opc/app/(main)/progress/page.tsx:102)。  
   依据：新增灰字解释“不靠帮助时写到什么水平”“完成第一篇精练后可以做”“两次之间至少隔两周”，与明确的产品方向冲突。  
   建议：用“独立模考 · 40 分钟”、开始按钮状态及下次可用日期表达；详细规则按需展开。

9. **[P2] 输入反馈：速刷新增 1,000 字符计数与共享输入框的 12,000 字符计数同时出现。**  
   位置：[quick-screen.tsx:583](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:583)、[composer.tsx:71](/Users/chen/Desktop/opc/components/coach/composer.tsx:71)。  
   复现：粘贴 11,000 字符，速刷工具栏显示 `/1000`，共享输入框又显示 `/12,000`。  
   建议：速刷接入层统一有效上限和计数呈现，避免两个相互矛盾的限制。

**测试汇总**

以下为添加临时复现脚本之前，对 `ed8b734` 副本运行的原有检查结果：

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  ✓ Types generated successfully；EXIT_STATUS=0
npm test           tests 284；pass 284；fail 0；EXIT_STATUS=0
npm run test:ui     tests 68；pass 68；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0
```

```text
PASS: idempotent baseline/migrations, owner scoping, cascading deletion, stale model-save rejection, and foreign-key enforcement.
```