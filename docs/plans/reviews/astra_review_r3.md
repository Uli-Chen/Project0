速刷自由输入：**不通过**。  
全站：**还需一轮**。

结论针对 `redesign@18e0791`。重发成功后，旧提问仍会作为隐藏草稿触发离开拦截，回答完成后还会重新出现在输入框。

所有检查和临时测试均在 `/tmp` 的 HEAD 副本运行；启动进程清空 `LLM_API_KEY`，未调用真实模型、未打开仓库 `data/` 数据库、未修改仓库或提交。审查末尾出现了他人的未提交速刷修复，本报告不将其计入验收。

上一轮第二部分的复核：

| 条目 | 状态 | 依据 |
|---|---|---|
| 1．成功 POST 覆盖远端卡片 | **已修复** | [quick-screen.tsx:131](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:131)、[client-state.ts:159](/Users/chen/Desktop/opc/lib/quick/client-state.ts:159)。事件测试确认：回答响应携带另一页的新卡片时，本地更新为远端内容，不再自动保存空字段。 |
| 2．提问等待期间缺少离开保护 | **部分修复** | [quick-screen.tsx:189](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:189)。事件测试确认前置保存、POST 挂起均受保护，首次发送成功后解除；但“重新发送”成功仍误拦截，见新问题 1。 |
| 3．复习 A→B→A 重复评分 | **部分修复** | [review-items.ts:94](/Users/chen/Desktop/opc/lib/learning/review-items.ts:94)。临时 API 测试确认短序列重放不推进；超过 20 个呈现键后失效，见新问题 2。 |
| 4．保存其他资料推迟截止日 | **部分修复** | [summary.ts:70](/Users/chen/Desktop/opc/lib/learning/summary.ts:70)。临时测试确认原例 `12月1日` 保持不变；已到期计划仍被重新延长，见新问题 3。 |
| 5．教练主动提供“独立”角度 | **已修复** | v16 的 [A4:114](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask/raw.json:114)、[B1:272](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask/raw.json:272)、[B2:311](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask/raw.json:311) 均只追问题目或学生已有内容，没有点名新角度或具体例子。 |
| 6．整句淡化导致编号难读 | **已修复** | [essay-reader.tsx:12](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:12)、[essay-reader.tsx:81](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:81)。只改变背景和下划线，正文、14px 编号保持实色。 |
| 7．图表字号 13px | **已修复** | [progress-charts.tsx:15](/Users/chen/Desktop/opc/components/pages/progress-charts.tsx:15)。字号为 14px，窄图减少刻度标签。 |
| 8．独立模考常驻灰字说明 | **已修复** | [checkpoint-invitation.tsx:103](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:103)、[progress/page.tsx:99](/Users/chen/Desktop/opc/app/(main)/progress/page.tsx:99)。规则移入按需弹层，页面显示开放状态；弹层可达性另见新问题 5。 |
| 9．速刷出现两个不同上限 | **已修复** | [quick-screen.tsx:585](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:585)、[composer.tsx:72](/Users/chen/Desktop/opc/components/coach/composer.tsx:72)。静态测试确认速刷只有 `/1,000`；作文教练默认仍是 `/12,000`。 |

第 1–4 条的独立证据：[组件事件测试](/tmp/opc-astra-r3-events.log)、[复习 API 测试](/tmp/opc-astra-r3-review-replay.log)、[日期测试](/tmp/opc-astra-r3-dates.log)。

上一轮复核表中“部分修复”条目的复核：

| 原表条目 | 状态 | 依据 |
|---|---|---|
| 速刷 6．交互回归测试 | **部分修复** | [quick-client-state.test.ts:158](/Users/chen/Desktop/opc/tests/quick-client-state.test.ts:158) 增加合并等纯函数测试；[quick-screen.test.ts:15](/Users/chen/Desktop/opc/tests/ui/quick-screen.test.ts:15) 仍为静态渲染，未覆盖真实重发按钮及异步完成路径。 |
| 速刷 7．模型评测及浏览器验收 | **已修复** | [quick-ask.md:95](/Users/chen/Desktop/opc/docs/plans/reports/quick-ask.md:95) 已补 §7.3；v16 原始输出已逐条复核。报告中的浏览器记录针对 `ed8b734`，不等于本轮改动的浏览器复验。 |
| 速刷 8．输入上限反馈 | **已修复** | [composer.tsx:59](/Users/chen/Desktop/opc/components/coach/composer.tsx:59)。有效上限和计数统一；临时事件测试仍确认程序注入的 1,001 字符不会发送。 |
| 全站 1．跨页卡片合并 | **已修复** | [quick-screen.tsx:214](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:214)。成功 POST 接入合并；临时事件测试还覆盖旧 POST 晚于新轮询、保存途中继续输入。 |
| 全站 10．复习幂等 | **部分修复** | [review-items.ts:99](/Users/chen/Desktop/opc/lib/learning/review-items.ts:99)。仍有回执淘汰边界，见新问题 2。 |
| 全站 21．备考时间 | **部分修复** | [summary.ts:51](/Users/chen/Desktop/opc/lib/learning/summary.ts:51)、[summary.ts:74](/Users/chen/Desktop/opc/lib/learning/summary.ts:74)。旧纯周数改称“计划备考”，不再伪装倒计时；到期后保存仍改变日期。 |
| 全站 25．独立模考命名与说明 | **已修复** | [topics/[topic]/page.tsx:54](/Users/chen/Desktop/opc/app/(main)/topics/[topic]/page.tsx:54)、[checkpoint-invitation.tsx:103](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:103)。入口命名及规则展示已调整。 |
| 全站 26．次要文字及编号字号 | **已修复** | [progress-charts.tsx:15](/Users/chen/Desktop/opc/components/pages/progress-charts.tsx:15)、[essay-reader.tsx:81](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:81)、[issue-list.tsx:13](/Users/chen/Desktop/opc/components/feedback/issue-list.tsx:13)。相关字号均达到 14px。 |
| 全站 31．作文列表 tabs 语义 | **已修复** | [essay-table.tsx:42](/Users/chen/Desktop/opc/components/library/essay-table.tsx:42)。改为有名称的按钮组，三个原生按钮使用 `aria-pressed`，不再留下孤立 tabs。 |
| 全站 6．历史导航保护 | **有意未改** | [deep-leave-guard.tsx:45](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:45)。按约定不计问题。 |
| 全站 8．表达、润色及采用功能 | **有意未改** | [session-store.tsx:318](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:318)。交创始人决定，不计问题；准入估算上限同样排除。 |

长段落静态测试确认：12 个标记保持在同一段落内，采用行内背景、14px 编号及相对上移，没有整句透明度。**未完成实际换行布局、键盘焦点和读屏实测**：浏览器连接不可用，本机 Chrome 访问也报错。相关静态验证见[日志](/tmp/opc-astra-r3-render.log)。

本轮确认的问题，按严重程度排序：

1. **[P1] 速刷状态：点击“重新发送”成功后，已发送提问仍留在隐藏草稿中，持续误拦截离开。**  
   位置：[quick-screen.tsx:507](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:507)、[quick-screen.tsx:312](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:312)。  
   复现：输入提问→断网失败，文字恢复→点击“重新发送”→成功收到教练问题。可见回答框为空，但 `beforeunload` 仍注册，点击“练习”被拦截；回答完成后，旧提问重新出现在输入框。按钮调用 `ask(..., false)`，没有经过 Composer 清空流程，成功结算也未清除恢复的草稿。  
   建议：确认送达时，仅清除与该请求文字相同的草稿，保留期间新输入的不同文字；增加按钮重发的组件事件回归。末尾观察到的未提交修复正在处理此处，但不属于指定 HEAD。

2. **[P1] 复习幂等：只保留最近 20 个回执，使更早的同一请求重新改变复习进度。**  
   位置：[review-items.ts:89](/Users/chen/Desktop/opc/lib/learning/review-items.ts:89)、[review-items.ts:99](/Users/chen/Desktop/opc/lib/learning/review-items.ts:99)。  
   复现：A 提交 `good`，另一页对同一卡片提交 20 次不同呈现的 `again`，随后原样重放 A；返回 `replayed=false`，`box=0→1`。全程无需推进日期，“没记住”会让同一卡片继续循环。  
   建议：保存独立回执；如需清理，定义并校验请求有效期，过期请求应拒绝，不能重新评分。

3. **[P1] 日期保存：周数计划到期后，仅保存其他资料仍会自动续期。**  
   位置：[summary.ts:74](/Users/chen/Desktop/opc/lib/learning/summary.ts:74)、[onboarding-form.tsx:21](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:21)。  
   复现：固定当前日期为 11 月 13 日，原截止日为 11 月 12 日，`weeksChanged=false`；表单显示 1 周，保存结果变成 11 月 19 日。  
   建议：未主动修改备考时间时保留原日期，包括已到期日期；续期应由学生明确修改周数触发。

4. **[P2] 离开反馈：发送期间打开的放弃确认框，在发送成功后仍显示已经失效的未保存警告。**  
   位置：[quick-screen.tsx:327](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:327)、[quick-screen.tsx:630](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:630)。  
   复现：首次发送挂起→点击“练习”→请求成功。此时没有脏卡片或未发送文字，实际离开拦截已经解除，但“放弃未保存并离开”确认框仍保留，并恢复可点击。此项与问题 1 的隐藏草稿不同。  
   建议：请求结算后重新核对离开原因；内容全部确认保存时，关闭失效确认框或继续原导航。

5. **[P2] 读屏可达性：独立模考“规则”弹层是没有可访问名称的 dialog。**  
   位置：[checkpoint-invitation.tsx:109](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:109)。  
   依据：弹层仅包含列表，未提供 `PopoverTitle`、`aria-label` 或 `aria-labelledby`；底层 [PopoverPopup.js:90](/Users/chen/Desktop/opc/node_modules/@base-ui/react/popover/popup/PopoverPopup.js:90) 输出 `role="dialog"`，名称依赖未设置的 `titleId`。触发按钮的“规则”不会自动成为弹层名称。键盘关闭与焦点管理由组件库提供，本轮未实测。  
   建议：添加“独立模考规则”的 `PopoverTitle`，可用 `sr-only` 隐藏；补测键盘打开、Escape 关闭及焦点返回。

以下为添加临时脚本前，对 `18e0791` 副本运行的原有检查汇总：

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  ✓ Types generated successfully；EXIT_STATUS=0
npm test           tests 292；pass 292；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0
```

```text
PASS: empty database full migrations and migration replay.
PASS: existing baseline database upgrades, preserving users, auth and session JSON byte-for-byte.
PASS: WP4a→WP7 migration preserves Quick data; deletion retains ten metadata tables including checkpoint qualification and releases occupancy (users-only CASCADE).
PASS: idempotent baseline/migrations, owner scoping, cascading deletion, stale model-save rejection, and foreign-key enforcement.
```