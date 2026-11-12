速刷自由输入：**有条件通过**。  
全站：**本轮可收尾**。

审查版本：`redesign@0128c8c`。本轮范围内未发现 P0/P1；上轮 P2 的主要路径已修复，但仍有一个遗留分支。**可收尾，P2 留作后续**。既定暂缓项不计入阻断。

| 复核项 | 结果 | 测试依据 |
|---|---|---|
| 点击“重新发送”确认 A | 通过 | `A\nB` 清理为 B，后续发送仅包含 B |
| 新快照确认 A | 通过 | 移除前置 A，保留后续文字及空白 |
| 学生修改过的草稿 | 通过 | 14 组修改、替换、重排及清空场景均原样保留 |
| 直接发送合并草稿 | 仍有 P2 | 两种完成时序均重新恢复已送达的 A，见下 |
| 状态组合与竞态 | 未发现 P0/P1 | 22 项事件回归、216 组草稿展示、12 种底部状态、24 种离开保护组合通过 |

临时测试执行实际组件处理器，采用模拟网络与 Hook 驱动；未做浏览器原生交互实测。[修复复核脚本](/tmp/opc-astra-r8-harness/review-r8.ts)、[边界测试脚本](/tmp/opc-astra-r8-harness/review-r8-edges.ts)。

本轮发现：

1. **[P2] 草稿对账：直接发送恢复后的合并草稿时，重放成功仍会把已送达的旧提问恢复回来。**  
   文件：[client-state.ts:89](/Users/chen/Desktop/opc/lib/quick/client-state.ts:89)、[quick-screen.tsx:319](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:319)。  
   依据：A 断网后恢复为 `A\nB` → 点击输入框发送 → 实际沿用旧请求 ID 重放 A → 等待期间输入 C → A 确认后，先清理当前草稿，再由 `outcome.restore` 放回整段 `A\nB`，最终留下 `A\nB\nC`。普通成功响应及“轮询先确认、响应随后丢失”均已[复现](/tmp/opc-astra-r8-edges.log)。下一次手动发送会重复包含 A；没有自动重复请求，故仍列 P2。  
   建议：恢复合并草稿前，也移除其中已确认且未经修改的恢复前缀；补充这两种时序的组件级回归。

检查均在 `/tmp` 隔离副本运行，启动时清空 `LLM_API_KEY`，未调用真实模型、未打开仓库 `data/` 数据库。802 个已跟踪文件哈希未变，未提交，原有 `model-showcase/` 未触碰。

```text
npm run lint       EXIT_STATUS=0
npm run typecheck  Types generated successfully；EXIT_STATUS=0
npm test           tests 295；pass 295；fail 0；EXIT_STATUS=0
npm run test:ui     tests 73；pass 73；fail 0；EXIT_STATUS=0
npm run test:db     4 条 PASS；EXIT_STATUS=0

临时修复／边界验证：32 个场景通过；2 种 P2 时序复现
既有事件回归：22 项通过；EXIT_STATUS=0
状态组合：216 + 12 + 24 组通过；EXIT_STATUS=0
```

临时缺陷复现断言通过，表示确认缺陷存在，不代表该分支修复通过。