你是“题库改版（0.4）”的实现者（Codex gpt-6-astra）。WP2b 及修订 1 已通过负责人代码审阅（改动在工作区，未提交）。创始人决定：**所有测试由实现者完成**，包括端到端验证；负责人只审阅证据（见开发方案第 6、7 节的更新）。现在请完成 WP2b 的端到端验证。

仓库 /Users/chen/Desktop/opc，分支 `question-bank-0.4`。不要提交、切分支、push；不联网、不加依赖；**不调用真实模型**（`.env.local` 里的模型密钥不得使用：启动服务器时把 `LLM_API_KEY` 设为空，或指向本地假模型）。不得打开或修改 `data/app.db`；一切在临时目录的新数据库上进行。不修改 `.claude/` 下的文件。

## 要验证的情境（每条写清步骤、命令、观察到的结果）

准备：临时目录建库 → `db-init` → drizzle 迁移 → `db:import-questions`。

1. **启动扫描**：库里有一个用户（无 `legacy_scan` 行），带一条旧的 `stage = finished` 会话（无 `schemaVersion`，`prompt.id = "technology"`，含 `submitted.original` 与 `evaluation`）。启动服务（优先 `next dev` 或 `next start` 在本机端口；沙箱若禁止监听端口或 IPC，改为进程内调用 `instrumentation.ts` 的 `register()` 再执行路由，并在报告中说明原因）。验证：`legacy_scan` 出现该用户的行；该会话有一条 `legacy = 1`、`completed_at = null` 的完成事件；`familiarity` 中 `qfamily_remote_work` 的 `deep_original_submitted` 与 `prior_feedback` 为 `unknown_time`；会话 JSON 前后逐字节相同。再启动一次，结果不变。
2. **旧会话正常打开**：以该用户身份请求 `/essays/<旧会话 id>` 页面（真实服务器下用登录 Cookie 请求 HTML；进程内则渲染页面组件），确认走原编辑/反馈界面而非只读视图，`completedAt` 投影为 `null`。
3. **回顾失败与重试**：一条 `stage = feedback`、`reviewStatus = "failed"` 的会话，页面 HTML 中有“提纲回顾失败，评分与问题反馈已保存。”与“重试”按钮，评分与问题区仍显示。用假模型执行 `retryReview` 动作（真实路由）：成功后 `reviewStatus = ok`、完成事件数量与内容不变、评分未重跑（模型只被调用一次）；再用一个失败的假模型重复一次，`reviewStatus = failed`，阶段与完成事件不变。
4. **新原稿资格**：新建精练会话，写入正文后用假模型执行原稿 `evaluate`：返回后 `originalSubmittedAt` 已写、`completion_events` 有一条当前时间的事件，`stage = feedback`。

能截图就截图（保存到 `docs/plans/reports/WP2b_e2e/`，PNG）；无法使用浏览器时，保存关键 HTML 片段与数据库查询输出作为证据。

## 完成后

1. 若发现缺陷：不要扩大改动范围；只修复该缺陷并补测试，在报告中说明。
2. 重跑 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run test:db`。
3. 在 `docs/plans/reports/WP2b.md` 末尾加“端到端验证”一节：环境、每个情境的步骤与结果、证据文件路径、命令结果摘要。
4. 最后一条消息用三行概括。
