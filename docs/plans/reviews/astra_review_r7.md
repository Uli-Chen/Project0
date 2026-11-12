速刷自由输入：**有条件通过**。  
全站：**本轮可收尾**。

审查版本：`redesign@2402b2e`。上一轮 P1 两条路径均已修复；本轮未发现遗留 P0/P1，发现 1 条 P2。**可收尾，P2 留作后续**。已约定暂缓项不计入阻断。

| 复核项 | 结果 | 测试依据 |
|---|---|---|
| 前置保存失败 | 通过 | 发送 A、等待期间输入 B、保存失败后完整保留 `A\nB`；多行及合计 2,001 字均未丢失，超限发送被拒后文字仍在 |
| 重放完成 | 通过 | A 超时后发送 B、等待期间输入 C；重放沿用 A 的请求 ID，完成后保留 `B\nC`；回答、失败、额度耗尽三种状态均可选中、清除 |
| 恢复后的继续操作 | 通过 | 合并草稿可重新发送；清除或确认送达后解除相应离开保护 |
| 状态组合与竞态 | 未发现 P0/P1 | 22 项既有事件回归、216 组草稿展示、12 种底部状态、24 种离开保护组合通过；覆盖双击、超时、冲突、轮询先返回、旧响应晚到及保存期间续写 |

依据：[本轮临时脚本](/tmp/opc-astra-r7-harness/review-r7.ts)、[事件日志](/tmp/opc-astra-r7-review-r7.log)。测试执行实际组件处理器，使用模拟网络和 Hook 驱动，未进行浏览器原生交互实测。

1. **[P2] 草稿对账：合并草稿中的旧提问确认送达后仍保留，后续发送整个草稿会再次包含旧提问。**  
   文件：[client-state.ts:103](/Users/chen/Desktop/opc/lib/quick/client-state.ts:103)、[quick-screen.tsx:147](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:147)、[quick-screen.tsx:319](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:319)。  
   依据：A 发送期间输入 B，断网后恢复为 `A\nB`；重试或新快照确认 A 后，清理逻辑只匹配整段相等，因此仍留下 `A\nB`。回答教练后再次点击发送，会以新请求发送整段。没有自动重复请求，文字可手动编辑，故列 P2。  
   建议：标记自动恢复片段的来源，确认送达时仅移除对应且未经修改的恢复片段，保留 B。

检查在 `/tmp` 隔离副本运行，启动时清空 `LLM_API_KEY`，未调用真实模型、未打开仓库 `data/` 数据库。800 个已跟踪文件校验未变，未提交，原有 `model-showcase/` 未触碰。

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  Types generated successfully；EXIT_STATUS=0
npm test           tests 294；pass 294；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0

本轮临时测试：7 项回归通过；2 种 P2 路径复现；EXIT_STATUS=0
既有事件回归：22 项通过；EXIT_STATUS=0
状态组合：216 + 12 + 24 组通过；EXIT_STATUS=0
```