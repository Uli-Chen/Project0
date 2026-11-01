# WP8 只读回滚演练

2026-11-01，隔离临时目录，全新临时 SQLite，无真实账户/数据/模型。

1. git archive cd6752b 导出 WP2a 程序到临时 old 目录，链接现有 node_modules。
2. 当前程序执行 seed.ts（运行时原位为 scripts/verify-wp8-rollback-seed.ts；需将 import 相对路径按项目根调整），全量迁移到 0006，建测试用户/认证、速刷会话和学生卡片。
3. old/tests/rollback.ts 以 node --conditions=react-server --import tsx 执行，旧 GET 返回 200，PATCH/Deep action/continueDeep 返回 409；会话整行字节、新表、卡片不变。
4. old/tests/rollback-ui.ts 以 node --import tsx 执行，旧 SessionView 分派 ReadonlySession，SSR 无 button 或 textarea。

结果 result.json 与 readonly.html。seed.json（含测试认证与JSON）及 SQLite 仅在临时目录，不入库。脚本是演练证据，不在项目构建或测试入口。
