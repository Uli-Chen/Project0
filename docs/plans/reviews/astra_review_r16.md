**有条件通过。可收尾，P2 留作后续。**

1. **[P2] 旧版兼容：新评分覆盖旧 profile 回执后，旧请求会再次计分。**  
   位置：[app/api/review/route.ts:48](/Users/chen/Desktop/opc/app/api/review/route.ts:48)、[lib/learning/review-items.ts:100](/Users/chen/Desktop/opc/lib/learning/review-items.ts:100)。  
   复现：预置旧 `graded` 或 `key/result` 回执 → 新键评分 → 重放旧键；两种格式均返回 `replayed:false`，并接受不同评分，将 box 从 2 重置为 0。直接重放虽能识别，但未将旧回执落表。  
   建议：在同一事务内，将即将覆盖或清理的旧回执转存至 `request_receipts`，再移除 profile 字段，并补充交错重放测试。

第 9 轮第 5、6 条的原有效期问题已不再适用。边界行为确认：条目不存在时先返回 404；仅排期被清空时仍返回原评分及 `replayed:true`，响应使用临时 `box:0`，不重建排期。

检查在 `/tmp` 的提交副本运行；原仓库未修改，未打开 `data/` 数据库，未调用真实模型。

```text
npm run lint      PASS，exit 0
npm run typecheck PASS，exit 0
npm test          PASS，301 tests，301 pass，0 fail
npm run test:ui   PASS，73 tests，73 pass，0 fail
npm run test:db   PASS，4 项汇总全部通过，exit 0

补充 API 验证     9 tests，7 pass，2 fail（均为上述旧回执问题）
客户端 Hook 夹具  3 checks passed；非浏览器 E2E
```