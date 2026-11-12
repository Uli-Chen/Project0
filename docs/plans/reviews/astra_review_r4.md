速刷自由输入：**不通过**。  
全站：**还需一轮**。

针对 `redesign@96a8837`，仍有 **2 条 P1、1 条 P2**。仓库未修改、未提交；检查与临时测试均在 `/tmp` 副本运行，启动时清空 `LLM_API_KEY`，未调用真实模型、未打开仓库数据库。约定有意未改项不计入问题。

| 上轮条目 | 复核结果 | 证据 |
|---|---|---|
| 1．重新发送后旧提问残留 | 已修复 | 超时→按钮重发成功→回答完成，草稿保持为空，离开保护解除；不同的新草稿保留。[事件测试](/tmp/opc-astra-r4-events.log) |
| 2．复习回执过早淘汰 | 常规场景已修，边界仍有 P2 | 穿插 100 次评分后重放不推进；第 1、29、30 天均能去重。淘汰后仍会重新评分，见问题 3。[API 测试](/tmp/opc-astra-r4-review-api.log)、[时间边界测试](/tmp/opc-astra-r4-retention.log) |
| 3．未改周数时保持截止日 | 部分修复 | 日期函数正确，但过期计划无法完成表单保存，API 也拒绝原日期，见问题 2。[表单测试](/tmp/opc-astra-r4-profile.log) |
| 4．失效离开确认框 | 已修复 | 成功发送且无待保存内容时关闭；有新草稿或脏卡片时继续保留。[事件测试](/tmp/opc-astra-r4-events.log) |
| 5．规则弹层名称 | 已修复，静态验证 | 弹层内已有 `PopoverTitle`，名称为“独立模考规则”。[结构测试](/tmp/opc-astra-r4-markup.log) |

本轮确认的问题：

1. **[P1] 草稿可恢复性：最后一次追问结束后，发送期间输入的新草稿被隐藏且无法取回，仍持续拦截离开。**  
   位置：[quick-screen.tsx:578](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:578)、[composer.tsx:54](/Users/chen/Desktop/opc/components/coach/composer.tsx:54)。  
   依据：剩余 1 次追问→发送 A→等待期间输入 B→收到追问→回答完成；此时额度归零、输入区消失，B 未发送且无恢复入口，离开仍提示放弃内容。`disabled` 只禁用发送按钮，文本框仍可输入；[临时事件测试已复现](/tmp/opc-astra-r4-events.log)。  
   建议：只要存在未发送草稿，就保留可查看、复制、编辑或清除的入口，不随额度耗尽隐藏；覆盖重发旧请求时保留新草稿的同类路径。

2. **[P1] 资料保存：已过期周数计划无法在保留原截止日的同时保存其他资料。**  
   位置：[onboarding-form.tsx:47](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:47)、[route.ts:25](/Users/chen/Desktop/opc/app/api/profile/route.ts:25)。  
   依据：原截止日 `2026-11-12`、当前 `2026-11-13`，空周数被判缺失，仅修改目标分仍无法保存；绕过表单提交未改变的旧日期，API 返回 `400 考试日期不能早于今天。`，保留原周数也一样。[表单证据](/tmp/opc-astra-r4-profile.log)、[API 证据](/tmp/opc-astra-r4-review-api.log)。  
   建议：表单与 API 均允许保留已有的过期计划；只有主动修改备考时间时才要求有效的新周数或日期。

3. **[P2] 复习幂等边界：回执淘汰后，旧呈现请求仍被当成新评分执行。**  
   位置：[review-items.ts:104](/Users/chen/Desktop/opc/lib/learning/review-items.ts:104)。  
   依据：A=`good`→31 天后 B=`again` 清除 A 回执→重放 A，得到 `applied=true`、`box 0→1`；同日穿插 500 次评分也可触发。[边界测试](/tmp/opc-astra-r4-retention.log)。  
   建议：为呈现请求建立可校验的有效期，淘汰后拒绝过期请求，避免重新评分；可作为后续加固。

其余速刷状态检查覆盖了双击发送、前置保存失败、轮询先于响应、旧响应晚到及保存期间继续输入，未再发现其他 P0/P1。浏览器连接不可用，本轮未完成键盘、焦点和读屏实测。

测试汇总：

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  ✓ Types generated successfully；EXIT_STATUS=0
npm test           tests 292；pass 292；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0

临时事件／表单／API／回执边界／弹层结构测试：均 EXIT_STATUS=0
（包含确认上述缺陷存在的复现断言，不能解释为功能全部通过。）
```