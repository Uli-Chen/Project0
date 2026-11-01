# WP8 发布验收与执行记录

日期：2026-11-01（Asia/Taipei）。用户授权连续推进 WP4b～WP8，并明确授权部署至 project0.auglearn.org / auglearn（35.201.196.43，squareofchen）。

## 当前验收结论

WP4b、WP5、WP6、WP7 完成实现、修订及工作区内独立交叉审阅。WP8 本机 Node 24.22.1 完整 `npm run check` 退出 0：lint/typecheck、后端 169/169、UI 27/27、数据库四组以及生产构建通过。证据：[完整日志](WP8_e2e/check-node24.log)。

外部 Claude review 的源码披露被自动审批拒绝，未向该服务发送源码，改由互不负责对应实现的工作区代理交叉审阅。审阅发现及修复见各工作包报告，不将此记录冒称 Claude 验收。

## 端到端与回滚

- 浏览器使用临时 SQLite、测试账户与本地假模型，未操作生产账户。主题进入速刷、卡片保存、追问、回答、原话摘取、缺口检查、修改后通过、卡片复习均完成；默认续写重复打开同一子作文，精练显示冻结卡片。
- 检查过程中继续编辑保存，迟到结果显示 stale，卡片保留新版本；关闭/恢复、技术失败/重试、删除与晚到结果由真实路由回归覆盖。
- 窄屏 390×844 与深色模式截图保存在 [WP5_e2e](WP5_e2e/)。未保存站内离开使用页面内确认，点击“继续编辑”后原文保留并可保存。截图：passed.jpg、continuation.jpg、stale.jpg、mobile.jpg、cards.jpg、unsaved.jpg。
- 检查点浏览器使用明确标注的已完成精练夹具触发邀请；声明“没有”开始模考，服务器倒计时刷新后从 39:59 到 39:56，不重置且无教练。自动测试另覆盖两个标签页、超时、外部练习、释放占位、删除基线和级联。
- 实际运行 WP2a 提交 cd6752b 的临时副本读取新 Quick：GET 200、PATCH/动作 409、只读无作文按钮；正文和新表原样保留。见 [回滚演练](WP8_rollback/README.md)。
- 四功能开关全关仍能创建/读取/保存/评分旧精练；新入口被禁用，Quick 只读。见 [开关、迁移与 G-01](WP8_e2e/flags-migration-g01.md)。评分输入、引擎与消息构造保持原样；DeepSeek 参数仅作用于官方服务的 Quick 用途。

## 真实模型验证

原默认思考模式在 512 token 追问上限下出现截断，保留首次失败证据。按官方文档仅对 Quick 使用 `thinking.type=disabled` 后，三种布局 6/6 首次返回有效结果，不增加额度。教练行为 16～20 暴露的重复立场提问、循环论证误判及合法空目标槽被拒均已修复并复验。见 [模型上限验证](WP8_real_model_probe.md)、[行为小样本](WP5_coach_behavior.md)。这些是有限样本验收，不代表全面质量保证或学习效果证明。

## 发布执行

发布脚本为 `deploy/release-wp8.sh`。先上传独立目录并在服务器 Node 24 完整检查，再备份真实数据库、停止单实例、迁移/导入/扫描、切换兼容程序。开关按题库→速刷→检查点逐项打开，FOCUS 保持 false；注册状态沿用既有配置。

线上发布已完成（Taipei 2026-11-01 14:40 起），发布版本 `53c52b4`：

- 服务器 Node 24 完整 `npm run check` 退出 0，169/169 后端、27/27 UI、数据库四组与生产构建通过；见 `WP8_e2e/opc-wp8-check.log`。
- 备份：`/home/squareofchen/opc-data/backups/2026-11-01T06-40-00.345Z-addcfc59-8275-47f9-9a28-74347e292e74.db`。
- 追加迁移全部成功，导入38题/7条别名，历史扫描 succeeded=1、failed=0。
- 旧代码保留：`/home/squareofchen/opc-before-wp8-20261101T063959Z`。新写入发生后的回退优先运行 `bash deploy/enable-wp8.sh reader`；禁止恢复旧备份覆盖之后的用户数据。
- reader → bank → quick → checkpoints 每阶段均用一次性账户完成真实 HTTP 页面/API 验证；Quick创建、卡片保存与读取成功；每次测试账户均已删除，没有真实模型调用。见对应 `opc-wp8-*.log`。
- 最终功能开关：QUESTION_BANK=true、QUICK=true、CHECKPOINTS=true、FOCUS=false。注册仍关闭。
- 最终检查：`opc` 与 `nginx` 均 active；SQLite integrity_check=ok；release-smoke 临时账户剩余0；模型 deepseek-flash，主机 api.deepseek.com。
- 公开 `https://project0.auglearn.org/login` 返回 HTTP200，TLS verification=0。

本次先前上传遭自动审批拒绝，用户随后明确授权了具体服务器目标后才上传；未绕过审批。
