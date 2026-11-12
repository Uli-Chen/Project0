速刷自由输入：**不通过**。  
全站：**还需一轮**。

审查版本为 `redesign@5a2f15f`。确认 **2 条 P1**，其中一条是上轮问题未完全修复。指定暂缓项不计入本轮问题。

| 上轮条目 | 复核结果 | 临时测试依据 |
|---|---|---|
| 1．额度耗尽后的提问草稿隐藏 | 原路径已修复 | 耗尽、卡住时草稿可见且带 `select-text`；点击“清除”后离开保护解除。[事件测试](/tmp/opc-astra-r5-events.log) |
| 2．过期周数计划无法保存 | 部分修复，仍有 P1 | API 接受原过期日期、拒绝新的过去日期；表单仍保留原生必填约束。[表单测试](/tmp/opc-astra-r5-profile.log)、[API 测试](/tmp/opc-astra-r5-profile-api.log) |

本轮问题：

1. **[P1] 草稿可恢复性：发送回答期间继续输入的新文字，在回答成功后被隐藏，仍拦截离开。**  
   文件：[quick-screen.tsx:403](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:403)、[quick-screen.tsx:493](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:493)、[composer.tsx:54](/Users/chen/Desktop/opc/components/coach/composer.tsx:54)。  
   依据：回答框发送 A → 等待期间输入 B → A 成功；B 留在 `answer` 状态，但回答框消失，新加的恢复入口仅覆盖 `askDraft`。剩余追问为 **0 和 1** 均复现：B 无查看、复制或清除入口，离开仍受阻。[复现日志](/tmp/opc-astra-r5-events.log)  
   建议：回答结束后也为未发送的 `answer` 保留可查看、复制及清除入口，覆盖上述两种额度状态。

2. **[P1] 资料保存：过期计划虽能通过业务校验，仍被表单原生约束阻止提交。**  
   文件：[onboarding-form.tsx:60](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:60)、[onboarding-form.tsx:89](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:89)、[onboarding-form.tsx:83](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:83)。  
   依据：原截止日 `2026-11-12`、当前 `2026-11-13`，修改目标分后保存按钮已启用，但周数仍为 `value=""`、`required=true`，表单未设置 `noValidate`；原生校验会阻止 `onSubmit`。日期模式保留旧日期也违反 `min=今天`。直接调用提交处理器和 API 均能成功，说明新增 API 测试未覆盖此阻塞。[测试证据](/tmp/opc-astra-r5-profile.log)  
   建议：未修改已有计划时同步放宽原生 `required/min`；主动修改时继续校验，并补浏览器提交测试。

其余状态检查覆盖双击、超时重发、版本冲突、轮询先返回、旧响应晚到、保存期间输入，以及 **12 种底部状态、24 种离开保护组合**，未发现其他 P0/P1。

仓库未修改、未提交；检查在 `/tmp` 副本运行，清空 `LLM_API_KEY`，未调用真实模型、未打开仓库 `data/` 数据库。浏览器连接不可用，未完成原生校验点击实测；上述表单结论依据实际组件属性和提交处理器测试。

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  Types generated successfully；EXIT_STATUS=0
npm test           tests 293；pass 293；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0

临时事件／表单／API／状态组合测试：均 EXIT_STATUS=0
（包含确认上述缺陷存在的复现断言，不代表功能全部通过。）
```