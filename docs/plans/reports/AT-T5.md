# AT-T5：反馈与共享 UI 集成报告

2026-11-03。

- 开关打开时默认显示 rank=1（缺失时首项），其余折叠为“还有 N 个问题”；原句从 submitted.original 定位。无问题不显示修改按钮。
- “改这个问题”在 feedback 等待 startRevision({openIssue}) 成功后才打开讨论；revising 直接讨论。失败不跳转，非首问题保留对应 rank；关闭的练习按钮不可用。
- 开关关闭时沿用旧展示。SessionProvider 的 perform 返回完成标记用于成功确认。
- 一并接入 T4 UI：写前给点提示按钮独立于 Composer，不发送未提交文本；达到帮助 2 或轮次上限禁用。example 建议按 express 插入光标链路处理；反馈阶段采用禁用但可忽略。retryable:false 保留失败文字并提供新 requestId 的“重新发送”。

验证：既有 UI 测试 41/41；相关文件 ESLint 通过。真实浏览器、390px 与深色模式，以及新反馈/卡片采用闭环需在主线统一测试，不以源码检查冒充浏览器验收。

集成复验：新增 `tests/ui/tutor-feedback.test.ts` 4/4，通过服务端真实组件渲染覆盖新旧开关、折叠、冻结原稿、零/单问题、模考、关闭练习和示范句按钮权限。测试先捕获了回顾区误重复显示主按钮的问题，移除重复块后通过。`tests/tutor-api.test.ts` 12/12 经真实路由与临时数据库验证来源作废、快照重试、并发提示、线程损坏保留、版本交错，以及非首问题的原子改写切换。
# Browser follow-up

See [AT-e2e.md](./AT-e2e.md) for the actual desktop/390 px dark browser run. It found and fixed stage-transition issue selection and mobile error/retry visibility; both were repeated successfully. Latest targeted tests: 26 unit/route tests and 4 feedback rendering tests passed.
