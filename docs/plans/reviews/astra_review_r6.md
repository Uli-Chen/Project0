速刷自由输入：**不通过**。  
全站：**还需一轮**。

审查版本：`redesign@db088f7`。上一轮两条已修复，但发现 **1 条遗留 P1**，阻止收尾。指定暂缓项不计入本轮。

| 复核项 | 结果 | 临时测试依据 |
|---|---|---|
| 1．输入框消失后的草稿恢复 | 通过 | 剩余追问为 0、1 时，发送回答期间续写的文字均可选中、清除，清除后解除离开拦截。[事件日志](/tmp/opc-astra-r6-events.log) |
| 2．过期计划保存 | 通过 | 未改周数时 `required=false`；保留旧日期时无 `min`；主动修改仍受约束。提交与隔离 API 测试确认原日期保留、新过去日期被拒绝。[表单日志](/tmp/opc-astra-r6-profile.log)、[API 日志](/tmp/opc-astra-r6-profile-api.log) |

表单复验覆盖实际组件属性、提交处理器和 API，本轮未另做浏览器原生提交实测。

1. **[P1] 数据丢失：恢复未发送提问时，若输入框已有新文字，待恢复文字会被直接丢弃。**  
   文件：[quick-screen.tsx:289](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:289)、[quick-screen.tsx:301](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:301)、[quick-screen.tsx:319](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:319)。  
   依据：两条事件路径均复现：
   - 卡片未保存 → 发送提问 A → 等待保存时输入 B → 保存失败：只剩 B；A 未发送、无恢复或重发入口。
   - A 超时 → 输入并发送 B，触发重放 A → 等待期间输入 C → A 成功：只保留 C，B 从未发送且已丢失。  
   
   根因是 `restoreAsk` 在当前草稿非空时忽略待恢复文字；新增恢复区域无法展示已经丢失的状态。[复现脚本](/tmp/opc-astra-r6/review-new-loss.ts)、[日志](/tmp/opc-astra-r6-new-loss.log)。  
   建议：将待恢复文字独立保留并提供复制、清除入口，覆盖前置保存失败和重放完成两条路径。

其余扫描覆盖双击、超时重发、版本冲突、轮询先返回、旧响应晚到、保存期间续写，以及 **216 组草稿展示组合、12 种底部状态、24 种离开保护组合**，未发现其他 P0/P1。

检查在 `/tmp` 副本运行；启动时清空 `LLM_API_KEY`，未调用真实模型、未打开仓库 `data/` 数据库。仓库未修改、未提交，原有 `model-showcase/` 未触碰。

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  Types generated successfully；EXIT_STATUS=0
npm test           tests 293；pass 293；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0

临时回归：22 项事件场景、表单/API、状态组合均 EXIT_STATUS=0
新增缺陷复现：2 条路径均确认丢失文字；EXIT_STATUS=0
（复现断言通过不代表功能通过。）
```