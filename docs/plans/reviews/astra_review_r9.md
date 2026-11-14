**不通过。** 有两处仍会丢失输入，需修复后重新验收。

1. **[P1] 数据丢失：已有教练请求处理中时，作文页卸载保存会直接跳过。**  
   位置：[lib/prototype/session-store.tsx:283](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:283)、[同文件:153](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:153)。  
   复现：以带 `pendingAction` 的服务器状态进入页面，修改正文后返回；此时没有本地 `actionController`，`save()` 返回 `false`，轮询和保存定时器又被清除。夹具记录 PATCH 次数为 **0**。建议：离开前持久化未保存正文及编辑基线，待请求完成后合并、补存。

2. **[P1] 数据丢失：速刷提问在发送前保存阶段离开，保存失败后无法恢复问题文字。**  
   位置：[components/quick/quick-screen.tsx:284](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:284)、[同文件:316](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:316)。  
   复现：修改卡片、输入提问并发送，在 `cardSave` 返回前离开，再让保存失败；Composer 已清空 sessionStorage，`restoreAsk()` 只更新已卸载组件的 state。夹具确认返回后输入框为空，提问也从未提交。建议：持久化准备发送及待确认请求的文字、请求 ID，收到明确回执后再清除。

3. **[P2] 恢复时序：已送达文字仍可能从旧页面状态恢复，服务器新副本到达后也不会清除。**  
   位置：[lib/prototype/session-store.tsx:275](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:275)、[components/quick/quick-screen.tsx:277](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:277)。  
   依据：恢复仅对初始消息检查一次；夹具先提供旧消息，再返回包含已送达文字的新快照，两页输入框都仍保留该文字。速刷发送后立即返回、响应在卸载后成功即可形成此条件。建议：结合最新快照和请求身份核对恢复内容，同时保护用户恢复后新写的文字。

4. **[P2] 草稿识别：按历史全文相等去重，会删除合法的新一轮同文输入。**  
   位置：[lib/drafts/local-draft.ts:19](/Users/chen/Desktop/opc/lib/drafts/local-draft.ts:19)。  
   复现：以前发送过“再给个例子”，之后再次输入同一句但尚未发送，离开再回来；函数直接返回空串。建议：按草稿／发送请求 ID，以及速刷回答对应的问题 ID 判断是否送达，不用整段历史文本相等代替身份判断。

5. **[P2] 复习同步：409 后刷新没有重建本轮队列，旧卡仍能换新键再次评分。**  
   位置：[components/review/review-deck.tsx:37](/Users/chen/Desktop/opc/components/review/review-deck.tsx:37)。  
   复现：返回 `review_expired`，刷新后的到期列表为空；夹具中本地队列仍有一张卡，旧回答和揭晓状态也保留，再点击会以新键提交同一 ID。建议：过期后重新建立有效队列并重置作答状态，确认卡片仍应呈现后才生成新键。

6. **[P2] 评分幂等：旧客户端键和超前的客户端时间仍可越过回执保留窗口。**  
   位置：[lib/learning/review-items.ts:97](/Users/chen/Desktop/opc/lib/learning/review-items.ts:97)。  
   复现：旧无时间戳键，或客户端快两天生成的键，在服务器超过 30 天且回执被清理后重放，仍被接受；实际函数验证均将 box 从 **2 推到 3**。客户端慢 30 天则新键也持续收到 409。建议：使用服务器签发的呈现时间；旧键无回执时要求重新呈现，并明确限制未来时间戳。

7. **[P2] 离开语义：速刷“放弃并离开”仍会保存卡片并保留未发送文字。**  
   位置：[components/quick/quick-screen.tsx:354](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:354)、[components/quick/leave-confirmation.tsx:12](/Users/chen/Desktop/opc/components/quick/leave-confirmation.tsx:12)。  
   依据：确认离开没有清理草稿键，也没有标记放弃；新增卸载回调仍调用保存，返回后又恢复文字，与按钮承诺不符。建议：明确区分“保留并离开”和“舍弃”，让保存、清理行为与选择一致。

仓库未改动，未打开 `data/` 数据库，未调用真实模型。检查在 `/tmp` 副本运行；额外时序验证使用 Hook 夹具，浏览器宿主不可用，未完成新增浏览器实测。

```text
npm run lint      PASS，exit 0
npm run typecheck PASS，exit 0
npm test          PASS，300 tests，300 pass，0 fail
npm run test:ui   PASS，73 tests，73 pass，0 fail
npm run test:db   PASS，4 项回归汇总全部通过，exit 0
```