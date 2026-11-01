你是“题库改版（0.4）”的实现者（Codex gpt-6-astra）。负责人已审阅你的 WP2b（`docs/plans/reports/WP2b.md`，改动在工作区，未提交）。结论：**修改后通过**，只有一处必须修改。仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。不要提交、切分支、push；不联网、不加依赖、不调用真实模型。

## 必须修改

**R1 撤回原稿重评入口的扩大。** `lib/pipeline/engine.ts` 中 `evaluate`（`kind = "original"`）允许的阶段恢复为改动前的 `["writing", "evaluating"]`。

原因：RFC §5 只规定“若重评发生”时的记账语义（只写 `feedbackUpdatedAt`、不新建事件），没有定义产品入口。放开到 `feedback` / `compared` / `finished` 会让任何客户端经 API 重跑评分，把已结束的作文退回 `feedback` 阶段，并留下过时的 `comparison` / `finish` / `revisionScores`，这是没有约定的产品行为。疑问表最后一行按 C 处理（仅底层写函数支持）。

具体要求：
- 重评语义保留在 `commitPracticeCheckpoint`（已有完成事件 → 只写 `feedbackUpdatedAt`，事件不变）；`acceptOriginal` 中对 `stored.stage === "finished"` 的防御分支可以保留。
- 用例 5 / RFC “Old finished record saved or regraded after upgrade” 的测试改为直接调用 `commitPracticeCheckpoint`（构造一份已有旧完成事件、`stage = feedback`、带新 `evaluation` 的状态）验证同样的断言；不再经 `runAction` 重评已结束会话。
- 其他依赖该扩大入口的测试同样改为函数层验证，断言强度不降低。
- 新增一条测试：对 `stage` 为 `feedback`、`compared`、`finished` 的会话执行 `evaluate`（original）均返回 409（阶段错误），不调用模型，记录不变。
- 报告 `docs/plans/reports/WP2b.md` 中“疑问”最后一行与“实现边界”相关描述改为 C，并在末尾加“修订 1”一节说明改动。

其余暂行边界（cutoff 家族集合、marker 的 resolution 列、不可解析题记 unknown、粘贴题不补 questionId、rewrite 优先）负责人均同意，不需改动。

## 完成后

运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`，在报告“修订 1”中贴结果摘要。最后一条消息用三行概括。
