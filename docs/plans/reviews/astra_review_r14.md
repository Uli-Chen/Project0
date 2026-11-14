**不通过。** 上轮四条的原复现路径均通过；新增确认 **3 条 P1、1 条 P2**。

| 上轮问题 | 复核结果 | 临时时序证据 |
|---|---|---|
| 旧 GET 倒退确认快照 | 原路径通过 | 保存 v2/B 后返回 v1/A，遗留 A 保留 |
| 放弃误伤之后的新发送 | 通过 | 转深练失败后新发提问，迟到失败仍可恢复 |
| 清理匹配记录后遗漏横幅 | 通过 | 删除匹配 A 后立即展示剩余 B |
| 部分恢复后未切换下载 | 通过 | 改写稿保存后，剩余原稿直接显示“下载” |

1. **[P1] 跨实例清理：旧页面迟到的保存响应会依据旧快照删除其他实例的记录。**  
   位置：[session-store.tsx:158](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:158)、[session-store.tsx:283](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:283)。  
   复现：旧页保存 A，v2 响应挂起；新页保存 B 至 v3，并展示另一 owner 的遗留 A；旧响应到达后，无条件调用 `offerRef.current()`，把另一 owner 的 A 删除。服务器仍为 B。  
   建议：已卸载实例的保存完成只处理自己的记录，不再执行全量清理；全量展示和清理由当前实例负责。

2. **[P1] 确认快照：动作和轮询响应未更新 `confirmed`，仍会按过期内容误删遗留记录。**  
   位置：[session-store.tsx:215](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:215)、[session-store.tsx:358](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:358)。  
   复现：确认提纲 A 后，教练动作或轮询返回提纲 B；页面已为 B，新增遗留 A 却被自动删除。另验证进入改写后，横幅仍按旧反馈阶段显示“下载”。  
   建议：所有携带服务器会话的响应统一推进带版本的确认快照，并重新计算横幅。

3. **[P1] 恢复消费：进入读取失败时，与缓存相同的副本会被直接删除，且不触发保存。**  
   位置：[session-store.tsx:421](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:421)、[session-store.tsx:428](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:428)。  
   复现：缓存和遗留记录均为 A，服务器实际为 B；进入 GET 失败后点击恢复，`differing`、`applied` 均为空，记录被消费，页面仍标记已保存，PATCH 次数为 0；重新进入只剩 B。  
   建议：本地相等不能视为已恢复落盘；未获得服务器确认时保留记录，并将恢复内容纳入保存。

4. **[P2] 离开语义：深练明确舍弃的聊天文字，会在迟到失败后重新出现。**  
   位置：[deep-leave-guard.tsx:36](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:36)、[session-store.tsx:91](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:91)。  
   复现：发送聊天，前置保存挂起；选择舍弃未发送文字并离开；保存迟到返回 400，旧请求把已舍弃文字写入孤儿槽，再进入输入框重新出现。  
   建议：深练也记录明确舍弃所覆盖的请求代次，阻止这些请求重新恢复文字。

[复核夹具](/tmp/opc-astra-r14-harness/review.cjs) · [新增时序](/tmp/opc-astra-r14-harness/new.cjs) · [跨实例复现](/tmp/opc-astra-r14-harness/more.cjs) · [离开复现](/tmp/opc-astra-r14-harness/deep.cjs)

检查在 `/tmp` 的 `f23b8e0` 副本执行，沿用上一轮时序夹具，未新增浏览器实测。仓库未修改、未提交，原有 `model-showcase/` 未动；启动时密钥置空，无真实模型调用，未打开 `data/` 数据库。运行环境 Node 25.8.2，仓库声明 Node 24.x。

```text
npm run lint       PASS，exit 0
npm run typecheck  PASS，exit 0
npm test           PASS，303 tests，303 pass，0 fail
npm run test:ui    PASS，73 tests，73 pass，0 fail
npm run test:db    PASS，4 项回归全部通过，exit 0
临时时序测试        37 个场景断言完成，包含上述新问题复现
```