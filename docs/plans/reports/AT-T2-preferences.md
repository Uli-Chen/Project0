# AT-T2：偏好与界面实现报告

2026-11-03。

- 增加默认关闭的 TUTOR_V2_ENABLED，服务端读取后通过账户页、SessionView、SessionProvider 下发。
- `explainLanguage`、`nudgesDefault` 可空；读取的有效值分别默认 en、true，未知原始值不回写。profile PATCH 从原始 JSON 合并明确提供的字段；原始未知字段与值保留。
- 用户中心新增讲解语言、写作思考语言、段落提醒偏好；仅在开关打开时显示。初始化提醒开关集中在 saveNewPractice，覆盖普通创建、题库、检查点、速刷继续精练，已有会话不覆盖。
- 第一条有 lang=en 的模型回复后显示英文提示；固定开场不触发，localStorage 不可用时同一次打开同一练习也只提示一次。

测试：tutor-privacy 3/3、现有 UI 41/41、相关文件 ESLint 通过。真实浏览器、API 原始 JSON 合并的集成测试等待主线统一验证。提示词及模型请求属于主线负责的 T2 实现，不在此报告宣称完成。
