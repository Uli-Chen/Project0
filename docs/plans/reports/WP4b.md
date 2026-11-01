# WP4b 速刷额度、追问、检查与恢复

2026-11-01。实现完成，供负责人复核；未提交、未部署。与 WP5/WP6/WP7 并行工作区，全量测试数字包含其他工作包当时已落地的测试。

## 实现

- 新增 `lib/pipeline/quick-model.ts`：quickFollowup、quickCheck、quickRetry、quickSupplemental；统一返回 session/card/requirements/operations/checkResults/budget。
- 初始包 2 次追问、2 次检查、共享 1 次技术重试；补充包 1 次检查 + 1 次技术重试，无追问；24 小时间隔，关闭旧包，不叠加未用额度。补充包可接管上包技术失败的同版本逻辑检查，沿用原 operation ID 和冻结输入。
- WP3 reserveCall 在 IMMEDIATE 事务中与操作、冻结输入、包用量、请求回执一起保存；模型调用发生在事务外；结束后重读当前卡片和会话，在短事务提交。滚动用户额度沿用 llm_calls，删除练习不重置。
- 首次和主动复检按 cardVersion 去重；追问按已返回的问题轮次去重，未回答上轮时重复返回。请求键参数冲突返回 409。
- `lib/rules/quick.ts` 从本题 subquestions 和布局生成要求。缺少槽位的要求由代码判 gap，模型只接收已填写要求；全部缺失时不调用、不建包、不扣次数。超过输入上限返回 422，整预留事务回滚。
- 检查校验要求集合完整、唯一、无额外条目；gap note 非空且 ≤60 字、不得包含六词英文示范；met note 必须 null。无效输出只自动重试一次，并消耗包内共享重试额度。模型内容不会写入卡片。
- 检查期间保存新版本允许，返回时旧结果记 stale；删除期间的返回不会重建正文或完成事件。第一次通过原子写入 completion_events，后续通过不移动完成时间，不更新 T/L 记忆。
- 启动钩子把 running 操作改 indeterminate；保留调用预留，不自动重发。显式重试读取原冻结输入，卡片已变更时结果 stale。
- lifecycle 支持开关开启的 Quick；关闭练习禁止新增卡片修改和模型动作，恢复后可继续。既有请求回放保留。

## 验证

已读本地 Next Route Handlers 与 instrumentation 文档。测试均为临时 SQLite、真实路由、假 provider；未联网调用模型、未改评分输入或冻结题库。

- `tests/quick-model.test.ts` 12/12：空要求、免费重放、并发保存 stale、英文示范校验及共享重试、追问轮次去重、补充包、崩溃恢复冻结输入、超长输入、调用中删除、缺子问题、删除后滚动额度。
- 全量 `npm test`：见最新 check-test.log（并行工作区测试数持续增加），0 失败。
- `npm run test:ui`：22/22（WP5 UI 修改前记录）。
- `npm run test:db`：4 组 PASS。
- `npm run typecheck`、`npm run lint`、`git diff --check`：通过。
- 日志见 [WP4b_e2e](WP4b_e2e/targeted-tests.log)。实现者进程内端到端证据为上述真实 POST/GET/DELETE 调用与数据库断言。

## 边界

未进行真实模型质量评估、浏览器交互或 build；前两项由整体 WP5/WP8 验证，build 归 WP8。Node 仍为当前本机运行时，未更换。预算拒绝在 HTTP 层返回 input_too_long/user_quota/package_quota 或 quota_exhausted 明确错误，预留事务回滚，不生成虚假的 provider 调用。

## 交叉审查修订

- 所有请求别名均先校验再重放；组合不同操作的已用键必须 409，同操作新增别名落回执。
- provider 成功后结果事务失败，先完整回滚，再 best-effort 将操作标记 indeterminate；额度不退、正文不覆盖，显式冻结输入重试可恢复。SQLite trigger 故障注入测试覆盖。
- 12 项定向路由测试及修订后 typecheck/lint/full tests 通过，最新证据已覆盖日志。
