# WP8 补充验收：关闭开关、迁移与 G-01

日期 2026-11-01；全部在测试创建的临时 SQLite 中执行，无真实模型或部署操作。

## 开关关闭回归

新增 `tests/release-flags.test.ts` 实际 Cookie/Route Handler 回归，四个开关全部 false：

- 旧自由模考创建、草稿 PATCH、GET 恢复均成功。
- 假模型原稿评分成功、stage=feedback、completion event 存在，仅一次评分调用。
- 题库创建、主题 API、检查点开始拒绝；已有 Quick 普通 GET 成功，Quick 编辑、继续成文及草稿 PATCH 返回 409。
- 旧 SessionView 的 provider/EssayScreen 与 Quick 只读展示已有 `tests/ui/session-view.test.ts` 覆盖。
- ProgressPage 在 CHECKPOINTS_ENABLED=false 时沿用普通 mock 图表；打开时才改为合格检查点趋势。

## 数据库迁移与删除

扩展 `scripts/test-db.ts`：

- 真正按 0000→0001→0002→0003→0004 分阶段迁移，在 WP4a 表中写入卡片、检查结果、冻结输入、操作及包，再升级 0005/0006。
- 升级后逐表内容一致，start_evidence_json 存在；全量迁移可重复执行。
- checkpoints 加入十张保留元数据表断言。删除正文后 checkpoint 保留、evidence_deleted=1、status=abandoned、资格证据不变、占位释放；外键只向 users CASCADE。
- 删除账户后所有十张元数据表及 Quick 正文表清空；旧账户/认证/会话 JSON 升级保持逐字节一致。
- test:db 四组通过，详见 check-test-db.log。

## G-01

与 WP4a 验收提交 b01e03d 比较，engine.ts、pipeline/schemas.ts、initial.ts、llm/messages.ts 完整文件 SHA256 一致，见 g01-evidence.json。因此评分提示词、task/essay/sentences 输入与 Schema 未发生改动。

client.ts 只增加 Quick 在官方 DeepSeek 的 thinking 参数；`tests/llm-calls.test.ts` 验证评分、未指定 purpose 和其他兼容服务请求无此参数。flags + llm-calls 共 21/21 通过，详见 flags-g01-tests.log。

本轮 lint、typecheck 通过。最终生产 build/部署由主 agent 汇总执行。
