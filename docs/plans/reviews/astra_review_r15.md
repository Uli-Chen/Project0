**有条件通过。可收尾，P2 留作后续。** 上轮 3 条 P1 的原复现路径已修复；P2 仍有一个时序窗口。

| 上轮问题 | 复核结果 | 临时时序证据 |
|---|---|---|
| 旧页面迟到保存误删其他记录 | 原路径通过 | 旧 v2 响应到达后，当前 v3 页面仍保留其他 owner 的记录 |
| 动作、轮询未推进确认快照 | 通过 | 两类响应均保留旧内容副本；进入改写后横幅切为可恢复 |
| 读取失败后恢复直接消费记录 | 通过 | 恢复触发保存；断网、409 均保留记录，成功确认后才清除 |
| 明确舍弃的聊天文字重新出现 | 部分通过 | **卸载后**迟到失败已拦截；**卸载前**仍可恢复文字，见第 1 条 |

1. **[P2] 离开语义：舍弃后、路由尚未卸载时到达的失败响应，仍会把文字写回。**  
   位置：[session-store.tsx:93](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:93)、[deep-leave-guard.tsx:36](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:36)。  
   复现：聊天前置保存挂起 → 选择舍弃并离开 → `router.push` 后暂不卸载 → 保存返回 400 → 文字写回输入框及存储，下次进入重新出现。无需多实例；目标路由加载较慢时存在窗口。  
   建议：在失败请求恢复文字的位置检查舍弃代次，无论页面是否已卸载；保留之后新发送的恢复能力。

2. **[P2] 恢复语义：恢复只比较服务器快照，可能留下当前编辑，与“替换现在的作文和提纲”不一致。**  
   位置：[session-store.tsx:439](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:439)。  
   复现：遗留作文与服务器相同、提纲不同；当前又修改作文。点击恢复只恢复提纲，作文仍是当前编辑；保存后横幅仍在，再点一次才恢复完整副本。作文、提纲互换也成立。  
   建议：恢复时应用当前阶段可保存的完整副本；服务器确认比较仅用于决定何时清除记录。

3. **[P2] 多记录展示：消费最新记录后，旧记录以完全相同的横幅接替，容易被误认为恢复未生效。**  
   位置：[session-store.tsx:298](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:298)、[essay-screen.tsx:137](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:137)。  
   复现：存有旧 A、新 B；恢复并确认 B 后自动展示 A，文案与按钮不变，再点恢复会用 A 覆盖刚恢复的 B。  
   建议：展示记录时间、剩余数量，并明确提示“已恢复，另有更早副本”。

4. **[P2] 跨实例边界：同时活动的旧控制器仍可依据自己的旧确认快照清除记录。**  
   位置：[session-store.tsx:296](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:296)、[session-store.tsx:303](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:303)。  
   复现：同一标签页、同一会话同时存在两个活动监听器，分别确认 v1/A、v2/B；加入遗留 A 后，旧监听器将其删除。  
   **触发要求严格：两个实例须同时存活并监听，且确认版本不同。当前普通导航路径未证实会形成该条件，实际可能性低；不能等同于上轮已修复的卸载后迟到响应。**  
   建议：由唯一活动实例执行全量清理，或共享会话最新确认版本。

[时序夹具与日志](/tmp/opc-astra-r15-harness/)沿用上轮夹具，共完成 50 个场景断言，包含上述 P2 复现。同实例新记录保留、批量事件刷新、保存失败阻止离开均已覆盖；正常存储条件下未发现事件循环。

检查在 `/tmp` 的 `c9be0de` 副本执行，未新增浏览器实测。仓库未修改、未提交，原有 `model-showcase/` 未动；启动时 `LLM_API_KEY` 为空，无真实模型调用，未打开 `data/` 数据库。环境为 Node 25.8.2，项目声明 24.x。

```text
npm run lint       PASS，exit 0
npm run typecheck  PASS，exit 0
npm test           PASS，303 tests，303 pass，0 fail
npm run test:ui    PASS，73 tests，73 pass，0 fail
npm run test:db    PASS，4 项回归全部通过，exit 0
临时时序测试        50 个场景断言完成，包含 P2 复现
```