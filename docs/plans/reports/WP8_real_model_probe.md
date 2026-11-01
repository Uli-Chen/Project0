# WP8 真实模型限制验证

2026-11-01。使用已配置的 `deepseek-flash`、三道不同布局的 mock 题及合成学生文字。临时 SQLite 测试库结束后删除，未读取或迁移应用数据库。密钥仅检查 `hasKey:true`，没有写入输出或报告。

执行 `node --conditions=react-server --import tsx scripts/verify-quick-model.ts`。首次沙箱访问失败，按要求申请 escalation 后重跑。成功连接的运行严格限制最多六次 fetch，自动重试也计入上限。

| 布局 | 操作 | provider 次数 | 实际 output tokens | 实际 provider 等待 | 结果 |
|---|---|---:|---|---|---|
| position_reasons | quickFollowup | 1 | 309 / 512 | 3573 ms | ok |
| position_reasons | quickCheck | 1 | 316 / 768 | 2629 ms | 有效 needs_development |
| problem_solution | quickFollowup | 2（含共享重试） | 512 / 512；512 / 512 | 4542、4065 ms | 两次 invalid_output |
| problem_solution | quickCheck | 1 | 201 / 768 | 2052 ms | 有效 passed |
| both_views_opinion | quickFollowup | 1 | 512 / 512 | 4680 ms | invalid_output；后续自动重试被探针硬上限阻止 |
| both_views_opinion | quickCheck | 0 | — | — | 六次额度已用完，未执行 |

结论：25 秒时限在本次样本内充足，两次检查在 768 输出限制内成功。512 输出上限对当前模型的追问不可靠：六次真实调用中，三次追问输出达到 512 且不合格，其中原因对策题重试仍失败。证据支持“当前配置下追问有限额耗尽风险”；没有保留 provider 正文，因此不能再细分每条失败的内部推理/可见输出占比。

建议在决定模型配置、思考参数或输出上限调整并复测之前，**生产 QUICK_ENABLED 保持关闭**。不据此自动提高 RFC 额度，未声称三题全流程或教练质量验收通过。

第三题失败后产品代码正常申请共享技术重试；测试 fetch 在第七次调用前拒绝发往网络。因此 JSON 账本有七条预留记录，实际 provider 请求只有六次。第七条 `latency_ms=0, input_tokens=null, output_tokens=null, outcome=indeterminate` 是探针终止记录，不能归因于模型服务失败或计为第七次 provider 调用。所有记录仅存在于已删除的临时测试数据库与去正文证据中。

复现脚本：[verify-quick-model.ts](../../../scripts/verify-quick-model.ts)。原始去正文结果：[real-model-probe.json](WP8_e2e/real-model-probe.json)。脚本类型检查通过；不自动重复执行，以免扩大调用费用。

## 参数修复后的复测（同日）

负责人核对 DeepSeek 官方文档后授权常规配置修复：[Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)、[Create chat completion](https://api-docs.deepseek.com/api/create-chat-completion)。仅当 hostname 为 `api.deepseek.com`、模型以 `deepseek-` 开头且 purpose 为 `quick_followup`/`quick_check` 时发送 `thinking: {type: "disabled"}`；评分、其他用途及其他兼容服务保持原请求参数。未提高任何 token、时间或次数限额。

调用配置版本与冻结输入中的 configVersion 增加 `quick-deepseek-no-thinking-v1`。新增自动化测试核对两种 Quick purpose 添加参数，scoring/无 options/其他 provider/其他模型不添加。

用相同三题合成内容再次执行，最多六次 provider 请求，结果 **6/6 首次返回有效输出，0 重试**：

| 布局 | 操作 | 实际 output / 上限 | provider 等待 | 有效结果 |
|---|---|---|---|---|
| position_reasons | quickFollowup | 34 / 512 | 2132 ms | ok |
| position_reasons | quickCheck | 38 / 768 | 852 ms | needs_development |
| problem_solution | quickFollowup | 35 / 512 | 730 ms | ok |
| problem_solution | quickCheck | 34 / 768 | 1733 ms | passed |
| both_views_opinion | quickFollowup | 33 / 512 | 1004 ms | ok |
| both_views_opinion | quickCheck | 43 / 768 | 923 ms | passed |

复测去正文原始证据：[real-model-probe-no-thinking.json](WP8_e2e/real-model-probe-no-thinking.json)。每次实际请求均记录 thinkingDisabled=true，旧失败证据未覆盖。该调整解除本次发现的模型限额可行性阻塞；首次保持 Quick 关闭的建议仅针对修复前配置，不再作为修复后配置的阻塞项。六例通过不代表完整教练质量评估，也不保证所有输入都能通过内容检查。

参数修复后的定向测试 32/32、typecheck、lint 均通过。运行使用临时 SQLite，未迁移生产数据、未改评分输入、未泄露密钥。两轮真实调用各六次，总计十二次，未继续扩大样本。
