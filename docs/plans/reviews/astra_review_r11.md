**不通过。** 确认 **4 项 P1、3 项 P2**；标准检查全部通过，但仍有内容丢失及静默覆盖。

| 上轮问题 | 本轮复核 | 临时时序测试证据 |
|---|---|---|
| 1 自动恢复覆盖远端新内容 | 原路径消失；后台保存出现同类覆盖 | 进入时不再自动应用；旧后台请求仍能覆盖已保存的 B，见问题 1 |
| 2 恢复覆盖进入期间的新输入 | 已消失 | 延迟进入 GET，新输入保留，遗留内容仅待选择 |
| 3 关闭／评估锁导致备份消失 | 部分修复 | 关闭状态保留；评估期间点击恢复仍删除唯一副本 |
| 4 旧保存成功删除新备份 | 原时序已修复；失败竞争仍存在 | A 成功不会删除 B；A 迟到失败却会覆盖 B 的遗留内容 |
| 5 速刷迟到响应覆盖／清空新输入 | 原时序已修复 | A 失败不覆盖 B，A 成功不清空 B；下次合并孤儿槽一次 |
| 6 恢复回答绑定旧问题 ID | 已修复 | q2 回答保留 q2 身份，确认送达后不再恢复 |

本轮问题按严重程度排列：

1. **[P1] 冲突覆盖：后台轮询会把旧正文套上最新版本，覆盖新页面已保存的正文。**  
   位置：[lib/prototype/session-store.tsx:303](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:303)、[同文件:133](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:133)。  
   复现：A 修改后离开等待教练；新页面保存 B；旧轮询读取 B 的版本，却保留本地 A，再提交。真实 PATCH 返回 **200，版本 3→4，正文 B→A**；新页面仍显示 B 和“已保存”。  
   建议：保留编辑基线，检测同字段远端变更；冲突时转为待选择的遗留记录，不能仅更新版本后提交旧内容。

2. **[P1] 持久化缺口：后台等待期间刷新目标页面，会丢失尚未落盘的唯一作文副本。**  
   位置：[lib/prototype/session-store.tsx:295](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:295)。  
   复现：教练仍忙时修改正文并返回，PATCH 尚未发出、遗留槽为空、卸载提示已移除；模拟目标页面刷新后，正文和恢复横幅均为空。  
   建议：离开时先同步保存带身份的待保存记录，后台成功后只删除对应记录；不必自动应用。

3. **[P1] 恢复丢失：评估期间点击恢复，编辑被拒绝，但遗留副本仍被删除。**  
   位置：[components/essay/essay-screen.tsx:138](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:138)、[lib/prototype/session-store.tsx:404](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:404)。  
   复现：评估中 `lifecycleBusy=false`，按钮可用；`edit()` 拒绝修改，随后清空存储。断言结果：正文未恢复、无未保存标记、副本消失。  
   建议：恢复入口遵守完整编辑锁；确认实际应用成功后才能消费记录。

4. **[P1] 实例竞争：旧页面迟到失败会覆盖新页面留下的遗留内容。**  
   位置：[lib/prototype/session-store.tsx:309](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:309)。  
   复现：A、B 两次编辑后离开；B 先保存失败，遗留槽为 B；A 后失败，同一个键被改成 A，B 丢失。  
   建议：遗留记录增加实例和编辑代次；保存多个版本，恢复／丢弃仅消费选中的记录。

5. **[P2] 可见性：已经返回页面后发生的后台保存失败，不会显示恢复横幅或错误。**  
   位置：[lib/prototype/session-store.tsx:286](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:286)、[同文件:309](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:309)。  
   复现：新页面进入后旧保存才失败；存储已有遗留内容，但当前 `leftover=null`、`error=null`，仍显示“已保存”，需要再次进入才发现。  
   建议：写入遗留记录时通知当前实例，及时显示待恢复状态。

6. **[P2] 恢复文案：横幅未说明恢复会替换原稿、改写稿和整份提纲。**  
   位置：[components/essay/essay-screen.tsx:137](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:137)、[lib/prototype/session-store.tsx:398](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:398)。  
   依据：点击后，新输入被旧正文替换，更新的改写稿及提纲也可能被旧空值覆盖；文案只说“一部分作文或提纲没能保存”。  
   建议：明确替换范围及覆盖当前修改的结果，提供预览或字段选择。

7. **[P2] 放弃语义：放弃并离开只清空输入框键，隐藏的孤儿内容仍会在下次进入时恢复。**  
   位置：[components/quick/quick-screen.tsx:396](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:396)、[同文件:105](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:105)。  
   复现：旧提问失败后进入孤儿槽；新页面选择放弃并离开；再次进入，旧提问重新出现。  
   建议：先展示迟到内容，明确放弃范围，并按记录身份清理对应孤儿内容。

测试采用 `/tmp` HEAD 副本及时序夹具，未新增浏览器实测。StrictMode effect 重放后的正常写入未误入孤儿槽；发送中离开保护断言通过。复习评分有效期问题未纳入。

仓库未修改、未提交；原有 `model-showcase/` 未动。未打开 `data/` 数据库，未调用真实模型。运行环境为 Node **25.8.2**／npm **11.11.1**，仓库声明 Node 24.x。

[时序脚本](/tmp/opc-astra-r11-harness/review.cjs) · [时序结果](/tmp/opc-astra-r11-targeted.log) · [真实 PATCH 结果](/tmp/opc-astra-r11-api.log)

```text
npm run lint       PASS，exit 0
npm run typecheck  PASS，exit 0
npm test           PASS，301 tests，301 pass，0 fail
npm run test:ui    PASS，73 tests，73 pass，0 fail
npm run test:db    PASS，4 项回归全部通过，exit 0
临时时序测试        20 个场景断言完成，包含上述异常复现
真实 PATCH 验证     HTTP 200，确认旧后台正文覆盖新正文；使用 /tmp 临时数据库
```