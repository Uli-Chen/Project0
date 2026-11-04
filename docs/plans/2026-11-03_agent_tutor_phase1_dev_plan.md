# 开发方案：Agent Tutor 第一阶段

* **负责人（方案、语义判定、验收）：** Claude Code
* **实现者：** Codex gpt-6-astra
* **日期：** 2026-11-03
* **状态：** 方案 v3（2026-11-03）。v1、v2 经实现者两轮 P-3 审阅，结论均为“修改后同意”，全部意见已处理（见 §10）。T1～T5 实现与统一技术检查完成。T6 已完成6轮固定语料真实回放、本地逐条盲审、规定抽查及独立A3覆盖补充；最终本地结果达到原设计数值门槛，另加的本地逐场景门槛仍未通过，两种口径及历史结果均保留。指定负责人的正式语义验收、真人试用与发布条件尚未完成。证据与剩余事项见 [统一验收报告](reports/AT-ACCEPTANCE.md)。
* **取代关系：** 本方案取代 [风格档位开发方案](2026-11-03_tutor_style_tiers_dev_plan.md) 中 WP1 之后的主线，对应关系见 §9。

## 0. 依据与范围

开发依据。两份文件冲突时，以排在前面的为准：

1. [Agent Tutor 设计方案](../designs/agent_tutor.md)（下称“设计”）：**唯一的行为依据**。
2. [风格档位 RFC](../designs/tutor_style_tiers.md) §4（调用记录与调用内容），按设计 §14.1 继承的部分。
3. [隐私说明草案](../privacy/privacy_notice.md)：T1 页面内容的来源。
4. 风格档位开发方案的 §3 实现约定、§3.2 的 B0 基线、WP1 条目，按本方案 §3、§4 的修改继承。

**范围：** 设计 §15 第一阶段，拆成 T1～T6（设计 §15.1 原来的 T1～T5 按审阅意见重排，见 §10 第 13 条）。

**不在范围内：** 设计 §15 第二至第四阶段的全部内容，包括 `LearnerBrief`、分类码、记忆重建、开场引用证据、写作重点、“展开讲讲”、推荐下一步、锁外提醒、卡片复习；三种风格；学生档位选择器；PDF 导出；速刷和总结（`finish`）接入新准则；修改任何批改提示词。

**条目编号：** LG 为继承自旧方案 WP1 的调用记录条目；AT 为本方案新增条目。

## 1. 分工与流程

| 角色 | 职责 |
|---|---|
| 负责人 | 写方案与工作包提示词；回答问题；**T6 的语义判定**；审阅证据并验收；通过后提交 |
| 实现者 | 按工作包实现；完成全部测试，包括浏览器和端到端验证，以及评测脚本的实现与运行；产品行为不清楚时先提问；**不提交** |
| 创始人 | 产品决定；补齐隐私说明待定项；安排试用者；批准提交、合并与部署 |

每个工作包：负责人发出 `docs/plans/tasks/AT-Tn_prompt.md` → 实现者在分支 `agent-tutor`（从 `tutor-style-tiers` 提交设计文档后切出）上实现，运行 §6 的检查，报告写到 `docs/plans/reports/AT-Tn.md` → 负责人按 §7 验收 → 通过后由负责人提交。

**依赖与估时**（估时是实现者的初步估计，不承诺固定总工期）：

| 包 | 内容 | 依赖 | 估时 |
|---|---|---|---|
| T1 | 观测与隐私 | P-1、P-3 | 3～4 天 |
| T2 | 准则与偏好 | T1 | 约 3 天 |
| T3 | 线程核心 | T2 | 约 3 天 |
| T4 | 动作与卡片接入 | T3 | 约 3 天 |
| T5 | 反馈默认推进一个问题 | T2 | 约 1.5 天，可与 T3、T4 并行 |
| T6a | 评测脚本与首轮运行 | T4、T5 | 约 2 天 |
| T6b | 语义判定、修复与重跑 | T6a | 视结果而定 |
| T6c | 试用 | T6b 门槛通过、P-4 | 由创始人安排 |

## 2. 开工前提

| 编号 | 内容 | 负责 | 阻塞什么 |
|---|---|---|---|
| P-1 | 提交设计文档、隐私说明草案和本方案到 `tutor-style-tiers`，再切出 `agent-tutor` | 负责人，需创始人批准 | T1 开工 |
| P-2 | 隐私说明的待定项：联系邮箱、备份保留天数、服务器日志保留期、DeepSeek 条款核对 | 创始人（负责人可协助核对条款） | T1 **部署**，不阻塞开发 |
| P-3 | 实现者审阅本方案 | 实现者 | v1、v2 已审阅；v3 的修改已逐条采纳实现者给出的替换文字，开工前由实现者在 T1 报告开头确认 |
| P-4 | 3～5 位试用者 | 创始人 | T6c |
| P-5 | 法务意见（跨境处理、未成年人） | 创始人 | 小规模免费试用（商业计划备忘录 §7），不阻塞本方案 |

旧方案的 W0-3（生产回复长度）、W0-4（PDF 依赖）、W0-5（校准作文）不再是本阶段前提。

## 3. 实现约定

旧方案 §3 的 1～11、13～15 条继续适用：先读 `AGENTS.md` 和 `node_modules/next/dist/docs/`；沿用现有代码风格；新表只走追加迁移；规则函数是纯函数并有单元测试；模型调用放在事务之外；不加新依赖；不批量改写旧会话；界面文字用简体中文；提示词只放在 `prompts/` 下，改了就升级 `promptConfigVersion` 并更新哈希测试；调用内容和提示词绝不离开服务器；真实模型验证用单独脚本；新的 `llm_calls` 字段一律允许为空，不改已有 CHECK 约束。旧方案 §3.1 的五条不变量继续适用。

**修改与新增：**

12′. **请求一致性以 B0 为唯一基线**（`90f5655` 的请求体字节，14 个逻辑调用点）。B0 指**固定输入**下的请求一致：同一份会话状态和用户资料，生成的请求体逐字节相同。它不承诺抹去开关打开期间已经产生的新历史内容。
- `TUTOR_V2_ENABLED=false`（默认）时，14 个调用点全部等于 B0。
- 开关打开时，批改组（`evaluate`、`compare`、`review`、`finish`）和速刷（`quick.followup`、`quick.check`）仍等于 B0；只有 8 个教练调用点（`prewrite`、`chat`、`clarify`、`polish`、`express`、`check`、`issue`、`nudge`）改变。
- **共享的 `coachSchema`、`prewriteSchema`、`buildMessages` 及其字段顺序保持原样。** 新路径使用独立的输出 schema 和拼装函数。领域类型 `Suggestion` 可以扩展（AT-23），但不能改动旧 schema。

16. **新教练路径放在 `TUTOR_V2_ENABLED` 后面**，默认关闭，只在服务器端读取并下发给前端。旧提示词文件不动，新文件另放（AT-07）。调用记录（T1）和隐私页面不受开关控制。

17. **规则在代码里。** 线程状态转移、帮助上限、增量校验、旧数据兼容，全部是 `lib/tutor/` 下的纯函数并有单元测试。

18. **可采用文字只走建议卡片**（设计 §7 第 5 条）。

19. **告警不重试**（设计 §10.4），写入调用记录。

20. **“状态不变”的含义**：本方案中“失败时状态不变”只指教学状态（`tutor`）、教练回复和提纲。现有路由在失败时更新 `pendingAction`、`version` 和时间戳的行为照旧。

## 4. 工作包

### T1 观测与隐私（3～4 天）

继承旧方案 WP1 的 LG-01～LG-06，修改如下：

- **LG-01 调用点表**：照旧。`llmPurposes` 增加 `writing_check`、`memory_summary`。
- **LG-02 精练调用都传 options**：照旧，包括 `client.ts` 的 `!options` 分支导致超时分类变化、学生看到的报错文字必须不变。
- **LG-03 `llm_calls` 新字段（修改）**：加 `call_site`、`stage_group`、`provider`、`prompt_version`、`params_hash`、`finish_reason`、`reasoning_tokens`、`move`、`allowed_help`、`provided_help`、`warnings_json`。**不加**风格、档位和 `judge_version` 相关字段。T1 写入前 7 个，并提供写入后 4 个的接口（AT-02），由 T2、T4 调用。
- **LG-04 `llm_call_payloads` 表**：照旧（90 天、随练习和账户删除、不存 `reasoning_content`、启动与写入时清理过期记录）。
- **LG-05 消息关联调用**：照旧（`CoachMessage.callId` 关联成功的那一次尝试）。
- **LG-06 输入投影**：照旧（保留基线已有字段、顺序和 ID；新元数据不进入请求）。T3 的线程视图通过同一套白名单进入教练请求。
- **AT-01 配置记录**：`prompt_version` 记录本次调用实际使用的提示词文件名及其哈希（由 `lib/llm/prompts.ts` 提供）；`params_hash` 记录实际发送的模型参数（含 `max_tokens`、`thinking` 等）的哈希。模型名与配置版本沿用已有的 `model`、`config_version` 列。执行配置的冻结见 AT-15。
- **AT-02 观测接口**：生成客户端增加可选的“调用结果元数据”参数，可以在成功尝试时附上 `move`、`allowed_help`、`provided_help`、`warnings`。写入失败不影响调用，与现有观测记录一致。
- **AT-03 隐私说明页面**：新增 `/privacy` 静态页面，内容取自[隐私说明草案](../privacy/privacy_notice.md)中给用户看的部分（不包括“维护说明”和附录）。登录页、注册页和用户中心各加一个入口。页面不需要登录即可访问。
- **AT-04 发布检查**：部署前运行的检查脚本（不放进 `npm test`），隐私页面中出现“【待定”时失败。开发环境可以带着待定项运行；**生产部署前必须通过**。
- **AT-05 备份保留**：`npm run db:backup` 支持环境变量 `DATABASE_BACKUP_KEEP_DAYS`。设置后，只删除备份目录中符合本脚本命名格式、且早于该天数的文件；未设置时不删除任何文件。天数由创始人在 P-2 决定。

**验收**

- 旧方案 WP1 的全部验收测试：14 个调用点各自的记录；`request-parity.test.ts` 固化 B0；四种失败情况；调用内容的写入、清理和删除；内容不外泄；在有数据的库上迁移。
- `prompt_version`、`params_hash` 在同一配置下稳定，换提示词文件或参数后会变化。
- AT-02：附带元数据的成功调用写入对应列；不附带时为空；写入失败时调用照常成功。
- `/privacy` 未登录可访问；三个入口可点击；390 px 宽度和深色模式下可读。
- 发布检查对含“【待定”的页面失败，对不含的页面通过。
- 备份清理：只删除过期且命名匹配的文件；其他文件不受影响；未设置天数时不删除。

### T2 准则与偏好（约 3 天）

- **AT-06 教练准则文件**：新增 `prompts/system/coach-preamble.txt`，内容为设计 §10.1 的 G1～G6、设计 §10.3 的方向提示规则（规则形式，不放正反例原文）、优先级声明（安全与身份 > 准则 > 输出格式与任务硬约束 > 任务其他内容），以及“按 `learner.explainLanguage` 选择讲解语言”。`prompts/system/preamble.txt` 不改。
- **AT-07 新任务指令**：新增 `prompts/coach-v2/{prewrite,chat,clarify,polish,express,check,issue,nudge}.txt`，旧的 `prompts/coach/*.txt` 不动。新指令和准则不重复，只写各调用点的任务与硬约束：
  - `prewrite`：只问一个问题；写前帮助上限 A2；只提取学生原话；不强求反方、例子或填满所有槽位；题型要求可以指出。
  - `issue`：按 `track` 和 `allowedHelp` 给帮助（设计 §10.2）；A3 / L3 只能通过 `suggest` 给一句，只用学生的内容。
  - `polish`、`express`、`check`：保留句子级修改的例外，范围不变。
  - `nudge`：最多指出一个缺口；没有就输出 null。
  - 升级 `promptConfigVersion`（例如 `coach-json-v5-tutor-p1`），更新提示词哈希测试。
- **AT-08 教练拼装**：新增教练专用的拼装函数，顺序为：教练准则 → 输出 JSON Schema → 任务指令 → 重试提示。只用于开关打开时的 8 个教练调用点。本包内，开关打开时 `chat`、`clarify`、`polish`、`express`、`check`、`nudge` 仍使用与旧版相同的输出 schema；`prewrite`、`issue` 在本包也先用旧输出 schema，T4 再切换为协议 schema。
- **AT-09 讲解语言的存储与解析**：
  - `UserProfile` 增加 `explainLanguage: "en" | "zh" | null`。`profilePatchSchema` 用枚举校验。
  - **原始值与有效值分开**：`/api/profile` 合并时只改请求中提到的字段，基于数据库里的原始 JSON 合并；有效值（`null` 或未知值按 `"en"`）只在读取时计算，不写回。修改名字等无关字段不能覆盖原始的未知值。
  - 开关打开时，8 个教练调用点的 `learner` 投影为 `{ target, difficulties, explainLanguage }`，**`issue` 和 `nudge` 也带上**；`difficulties` 照旧排除 `excludedMemoryIds` 中的 `self:` 项。
  - **`finish` 不改**：继续调用现有的 `coached()`，`language` 取 `profile.lang`，并保留 `preference:lang` 的排除语义。
  - 速刷不读 `explainLanguage`。
- **AT-10 用户中心“学习偏好”**：用户中心新增一行“学习偏好”，包含：
  - “讲解语言”：English（默认）/ 中文。只在开关打开时显示。
  - “写作思考语言”：沿用 `profile.lang` 的两个选项。
  - “段落提醒”：新字段 `nudgesDefault: boolean | null`，`null` 视为开启。只决定**新建练习**的 `nudgesEnabled` 初值；作文工具栏里的单篇开关保留。
  - 修改后从下一次新请求开始生效（AT-15）。问卷保持现状。
- **AT-11 首次英文讲解提示**：开关打开后生成的教练消息记录实际使用的讲解语言（`CoachMessage.lang`）。学生第一次看到 `lang = "en"` 的教练消息时，在教练面板显示一次“教练目前用英文讲解，可以在用户中心改为中文”。固定开场和历史消息不触发。是否已显示存在浏览器本地存储里，读写包在 try/catch 中；存储不可用时最多每次打开练习显示一次。
- **AT-12 提纲约束**：开关打开时，写前的提纲更新按设计 §10.4：`source` 不是学生原话则丢弃；`text` 不是学生某条原话的连续片段时，用已校验的 `source` 作为写入槽位的文字（设计 v1.3 已改为此规则）。被替换或丢弃的条数记入 `warnings`。

**验收**

- `request-parity.test.ts`：开关关闭时 14 个调用点全部等于 B0；开关打开时批改组、`finish` 和速刷等于 B0；`coachSchema` 序列化结果与 B0 相同。
- 开关打开时，8 个教练调用点按 AT-08 的顺序拼装，并使用 `coach-v2` 指令。
- 讲解语言：`null`、`"en"`、`"zh"`、未知值四种情况；未知值经过一次无关的资料修改后仍保留；`issue`、`nudge` 的请求中带有 `explainLanguage`；`finish` 的请求不变。
- 段落提醒默认值只影响新建练习，已有练习的开关不变。
- 首次英文讲解提示只在第一条英文教练消息后出现一次；本地存储不可用时页面正常。
- 提纲：原话片段照常写入；改述被替换为 `source`；`source` 不是原话的更新被丢弃；告警计数正确。
- 浏览器：桌面和 390 px 宽度、深色模式下，用户中心的学习偏好和提示显示正常。

### T3 线程核心（约 3 天）

本包只实现数据、纯函数、schema 工厂、执行快照和晚到结果检查，不接入任何动作。协议的完整定义见**附录 A**。

- **AT-13 类型与读取**：`lib/tutor/types.ts` 按附录 A.1 定义。`SessionState.tutor?: TutorState`，随 `state_json` 保存。`read-session.ts` 只校验 `tutor` 子树：
  - 缺失：视为 `null`。
  - `v` 大于当前版本：保留原始数据不改写；本次教学动作返回 409“这个练习由新版本创建，请刷新页面”。
  - 校验失败（损坏）：保留原始数据不改写；本次教学动作返回 409，并写服务器日志（不含内容）。
  - 其他字段的未知内容照旧保留。
- **AT-14 纯函数**（`lib/tutor/thread.ts`，全部单元测试），按附录 A.2 的转移表实现：`openThread`、`reopenThread`、`escalate`、`applyDelta`、`fromLegacy`、`threadView`（生成给模型看的线程视图）、`syncIssueLevels`（把问题线程的 `allowedHelp` 同步回 `issueLevels`）和 `reconcileLegacy`（见 AT-20）。
- **AT-15 执行快照**：在动作路由接受新操作、写入 `pendingAction` 的同一步，冻结 `pendingAction.tutor = { v2, explainLanguage, promptConfigVersion }`。规则：
  - **开关和偏好只决定新的 `requestId`。** 同一 `requestId` 的技术重试和恢复一律按快照执行，即使开关已经关闭（AT-19 的“开关关闭时返回 400”只适用于新请求）。
  - 快照中的 `promptConfigVersion` 已不可用、旧的 `pendingAction` 没有快照、或 AT-17 判定作废时：停止恢复，返回 409。此时**不清除 `pendingAction`**，而是写成 `{ ...pendingAction, error, retryable: false }`，保留原始输入；前端把学生的文字放回输入框，提供“重新发送”，重新发送使用新的 `requestId`。现有路由对 409 清除 `pendingAction` 的处理，对这几种情况改为上述行为。
  - 快照不含密钥和提示词正文。
- **AT-16 输出 schema 工厂**：`tutorOutputSchema(ctx)`，其中 `ctx = { thread, allowedMoves, refKeys, allowOutline, newThread }`。在 `superRefine` 中：
  - 校验 move、`help.level`、`track` 和 payload 的结构（附录 A.3）；
  - 用 `applyDelta` 对当前线程**预演**整批增量，任何一项不合法都记为 schema 错误。
  这样 `parseModelJson` 会抛出“格式不正确”，进入 `generateJson` 现有的重试；生成成功后不再有会让结果失效的校验（AT-17 的晚到检查除外）。
- **AT-17 晚到结果检查**：保存前重新读取用户资料，按附录 A.4 核对。不一致时整次结果作废，返回 409“设置已更改，请重新发送”，学生文字保留。

**验收**

- 纯函数：附录 A.2 每一行转移、A.3 每一种 move、旧数据兼容、裁剪规则都有单元测试。
- schema 工厂：用真实的 `generateJson` 和假 fetch 验证，非法输出第一次失败后进入重试，第二次合法时成功；两次都非法时抛出现有的格式错误；整批增量要么全部应用，要么全部不应用。
- `read-session`：缺失、未来版本、损坏三种情况，原始数据都没有被改写。
- 执行快照：失败后修改讲解语言，再用同一 `requestId` 重试，仍使用旧语言；新 `requestId` 使用新语言；进程重启后恢复使用快照；关闭开关后，已有请求仍按快照恢复，新请求走旧路径；作废后刷新页面，学生文字仍可恢复，重新发送使用新 `requestId`。
- 晚到检查：模型等待期间学生停用、直接删除、或改写了一条本次用到的自述难点，三种情况结果都作废，教学状态、回复和提纲都没有变化。

### T4 动作与卡片接入（约 3 天）

- **AT-18 写前接入**：开关打开时，`prewrite` 改用协议 schema（AT-16），允许的 move 见附录 A.3，提纲更新可以和任何允许的 move 共存（AT-12 的规则照旧）。线程视图进入上下文，20 条消息窗口照旧。
- **AT-19 “给点提示”**：
  - `actionSchema` 的 `prewrite` 增加可选 `intent: "more"`。`intent` 缺省时 `text` 必须非空（与现在相同）；`intent = "more"` 时 `text` 可以为空。开关关闭时，带 `intent` 的请求返回 400。
  - 写前输入框旁加“给点提示”按钮。点击时不提交、也不清空输入框里未发送的文字。
  - 保存的学生消息为 `{ role: "user", stage: "prewriting", action: "hint", content: "（请求提示）" }`。这条消息**不分配引用键**，不能作为学生观点的证据。
  - 计入 `prewriteTurns` 的 40 轮上限。
  - **升级在本轮生效：** 调用前先在临时线程上计算升级后的上限，模型生成和 schema 预演都使用这个上限；调用成功才把升级写入线程，失败不升级。达到上限（A2）后按钮不可用，并提示“试着先写下你的想法”。
  - 无文字的 `more` 请求不提供 `cur` 引用键。所有 `action = "hint"` 的消息都不能用于确认项、尝试或提纲的 `source` 校验。
- **AT-20 问题线程接入**：开关打开时，`issue` 改用协议 schema。线程键 `issue:<rank>`：
  - 请求明确传入 `newThread`。首次问题线程不发送尚未确定的 `track`，由模型在输出中必填并保存；写前始终为 `argument`，已有线程传入已保存的 `track`，输出不再声明。
  - `more` 调用 `escalate`；`ask`、`attempt` 不改上限；核验为 `met` 时通过 `delta.close` 关闭线程。
  - 每次成功后调用 `syncIssueLevels`，让现有按钮、关闭开关后的旧路径都看到同一个级别。
  - **重新开启后的对齐：** 线程记录最后处理的消息 id（`lastMessageId`）。开关关闭期间旧路径可能继续对话；重新开启后打开线程时，如果该线程范围内有晚于 `lastMessageId` 的消息，就调用 `reconcileLegacy`：`allowedHelp` 取最新的 `issueLevels[rank]`，清除开放问题，`providedHelp` 记为未知（`null`），不补造尝试。写前线程同理（只清除开放问题，不改上限）。
  - 线程视图进入上下文，8 条消息窗口照旧。
- **AT-21 帮助事件**：`tutor.helpEvents[]`，每篇最多 200 条，超出时丢弃最早的。字段与可空规则见附录 A.5。
- **AT-22 调用记录与告警**：`prewrite`、`issue` 通过 AT-02 写入 `move`、`allowed_help`、`provided_help`；所有教练调用写入 `warnings`。告警规则：写前回复中问号超过一个；回复正文中有 8 个词以上的英文完整句，而它不在学生原文中（`suggest` 也不例外：可采用的句子只能出现在卡片里）。
- **AT-23 示范句卡片**（只在 `allowedHelp = 3` 时允许 `suggest`）：
  - **模型输出**：`payload.suggestion = { suggestedText, reason }`，只含内容字段。`id`、`type: "example"`、`selectionText: ""`、`status: "pending"` 由服务器生成。
  - **领域类型**：`Suggestion["type"]` 增加 `"example"`。旧的 `coachSchema` 不改（§3 第 12′ 条）。
  - **插入**：`essay-screen.tsx` 中 `example` 与 `express` 走同一个插入分支、同一套插入位置规则，不能走选区替换。
  - **按钮**：`CoachThread` 和 `suggestion-card.tsx` 只有在采用回调存在、且当前阶段允许采用时才显示可点击的“插入”；反馈阶段显示不可点击的按钮和说明“开始改写后可以采用”。
  - **服务端权限**：`suggestion` 动作在 `feedback` 阶段允许 `dismissed`，不允许 `accepted`；`writing`、`revising` 照旧。
  - **AI 文字占比**：沿用现有计算（已采用并完整保留在正文中的建议文字），模考原稿仍固定为 0。
- **AT-24 失败语义**（设计 §8.3）：回复和增量一起接受或一起拒绝；重试用尽时，教学状态、回复和提纲都不变，学生的文字保留；同一 `requestId` 重放沿用现有的已完成请求处理，不重复记尝试、不重复升级。注意现有 `completedRequests` 只保留最近 50 个 ID，超出范围的重放按新请求处理。

**验收**

- 写前：普通消息、“给点提示”、连续点击、技术重试、失败后恢复、已完成请求重放；未发送的文字不丢失；“（请求提示）”消息没有引用键；达到上限后按钮不可用。
- 问题线程：学生的改写达标后，假模型输出 `check_attempt`，增量为 `recordAttempt(met)`、`clearQuestion`、`close`，四者一起提交，线程关闭；只输出 `confirm` 时线程不关闭，只清除开放问题；在两个问题之间切换，各自的线程互不影响；回到已关闭的问题时线程重新打开、状态保留；旧会话（有 `issueLevels`、没有 `tutor`）能正常打开和继续。
- 开关**打开 → 关闭 → 打开**：关闭期间旧路径使用同步后的 `issueLevels`，请求等于 B0；关闭期间继续对话并点了“再给点提示”，再打开后线程按 `reconcileLegacy` 对齐（上限取最新级别、开放问题已清除、`providedHelp` 为未知）。
- 示范句卡片：只在上限为 3 时出现；反馈阶段可以忽略、不能采用；改写阶段插入光标处；刷新后状态保留；重复点击采用只生效一次；采用后修改或删除插入的文字，AI 文字占比随之变化。
- 帮助事件：各入口的字段和可空性符合附录 A.5；`nudge` 返回 null 时不记事件。
- 浏览器：写前“给点提示”、问题讨论、示范句卡片在桌面和 390 px 宽度下完整走通。

假模型测试只证明流程正确，不证明真实教练不会重复追问，后者由 T6 证明。

### T5 反馈默认推进一个问题（约 1.5 天，可与 T3、T4 并行）

- **AT-25 进入改写并打开问题**：`startRevision` 动作增加可选参数 `openIssue: number`。服务器在同一次操作中进入 `revising`，并把 `activeIssue` 设为该 rank；返回的会话中带有这两个结果。前端在确认会话已经进入 `revising` 之后，才打开这个问题的讨论，不能在 `perform()` 之后直接串联调用。切换失败时不打开讨论。
- **AT-26 反馈页**：开关打开时，反馈页默认展开 rank 为 1 的问题：标题、原因、提示、在**提交的原稿**中定位的原句，以及主按钮“改这个问题”。在反馈阶段，主按钮调用 `startRevision({ openIssue: 1 })`；在改写阶段，直接打开讨论。其余问题折叠为“还有 N 个问题”，展开后的行为与现在相同。没有问题、模考、只有 1 个问题这三种情况都要正常显示。开关关闭时界面与现在相同。

**验收**

- 浏览器：桌面和 390 px 宽度（含手机抽屉）下完成“定位原句 → 改这个问题 → 讨论”；其余问题可以展开和讨论；深色模式正常。
- 切换失败（例如模拟服务器返回 409）时不打开讨论；从非第一个问题进入改写时打开的是该问题；练习关闭（`lifecycle` 不是 `open`）时按钮不可用。
- 组件测试覆盖没有问题、模考、只有 1 个问题三种情况。

### T6 行为评测与试用

**T6a 评测脚本与首轮运行（约 2 天）**

- **AT-27 用例**：`data/coach-cases/*.json`，30 个场景，至少 15 个是多轮回放。覆盖：五种题型；学生已答对；反复不会；改变立场；纠正之前的说法；循环论证；普通但正确的表达；诱导代写（“给我一个理由吧”）；学生文字中藏指令；天然容易列出角度的话题；英文和中文讲解；论证和语言两套阶梯各级；示范句卡片；**已停用、已删除或已改写的自述难点不得出现在回复中**（本阶段与“错误或已删除的记忆”对应的情况）；**超过消息窗口的长对话**（上下文截断）。至少包含[生产体验报告](reports/USER_EXPERIENCE_20261101.md)的重复追问场景和设计 §10.3 的正反例题目。
- **AT-28 评测脚本**：`scripts/verify-coach-behavior.ts`，开关打开的配置，每个场景跑 3 次。
  - 默认先 dry-run，估算调用次数与费用（**包含技术重试**）；单次运行上限 ¥50，超出需要负责人确认。
  - 完成确定性检查：结构、权限、帮助上限、告警统计。
  - 生成**盲审包** `artifacts/private/coach-eval/<run>/packet.jsonl`。每条包括：随机编号、题目、按顺序匿名化的多轮历史、当前学生输入、线程视图、教练回复、建议卡片内容。不包括配置、提示词版本和场景预期。
  - 失败的轮次（重试用尽仍无有效输出）也写进盲审包，标记为“无有效输出”。

**T6b 语义判定、修复与重跑（视结果而定）**

- **AT-29 量表与判定（负责人）**：负责人在 T6a 开始前提交量表 `data/coach-cases/rubric.md`，然后按量表逐条判定，写入 `judgments.jsonl`：是否违反 G1～G6（以及严重程度）、是否有效推进、是否属于“答对后重复追问”、拿不准。拿不准的按越界计，并单独列出。
- **AT-30 汇总**：脚本的 `--score` 模式合并确定性检查与判定，按设计 §12.3 计算门槛。规则：
  - 判定缺失或重复时拒绝汇总。
  - 分母为 0 的指标报告为“无样本”，不算通过。
  - “无有效输出”的轮次计入有效推进的分母，记为未推进。
  - 同时报告首次有效率、重试率和实际费用。
- 报告 `docs/plans/reports/AT-T6.md` 只放汇总表和逐例编号；逐例原文和判定理由放在 `artifacts/private/coach-eval/<run>/`，供创始人抽查。报告不包含请求全文或提示词。
- 未通过时，负责人列出失败的场景；实现者修改后重跑同一用例集，原始失败结果保留在报告中。

**T6c 试用**

门槛通过后按 §5 打开开关，3～5 位试用者各完成至少一篇完整练习（写前、写作、反馈、改写）。负责人从调用记录与教学状态中统计重复追问率、帮助级别和告警，连同试用者的反馈写入报告。

**验收**：设计 §12.3 的门槛全部达到（确定性检查全过；严重代写、伪造记忆、评分泄漏 0 例；答对后重复追问 ≤ 5%；有效推进 ≥ 90%，分场景报告）；报告写明样本量、费用和每项指标的分母。

## 5. 部署与回滚

1. **T1 可以先部署**，前提是 P-2 完成且 AT-04 发布检查通过。部署前备份数据库，迁移后确认已有 `llm_calls` 记录不变。
2. T2～T5 部署时，`TUTOR_V2_ENABLED` 保持关闭，先确认旧行为和 B0 不变。
3. T6b 的门槛通过后，在生产环境打开开关开始试用。
4. **回滚：** 关闭开关即回到固定输入下的 B0；已写入的 `tutor` 字段、帮助事件和新列原样保留，`issueLevels` 已经同步，旧路径可以继续使用。需要回滚代码时，表结构保持不变，旧代码忽略新字段。

## 6. 每个工作包的自测（实现者运行）

```text
npm run lint
npm run typecheck
npm test
npm run test:ui
npm run test:db
```

有界面或接口改动的工作包，还要在临时数据库上做端到端验证，截图或日志写进报告。T6 的真实模型脚本单独运行，报告附上输出摘要和费用。最后一个包另外运行 `npm run check`，并确认 `.next/static` 中没有提示词文字。

## 7. 验收（负责人执行）

1. 阅读全部改动，对照设计和条目编号，逐条检查 §3 的约定。
2. 自己重跑 §6 的命令。
3. 按各包的验收条目核对实现者提交的证据。测试由实现者完成；T6 的语义判定由负责人完成。
4. 结论三选一：通过；修改后通过（列出必须修改的点）；不通过（说明原因）。
5. 通过后由负责人提交。

## 8. 风险

| 风险 | 对策 |
|---|---|
| 新准则让写前追问变得更保守，学生觉得帮不上忙 | “给点提示”按钮；T6 的“有效推进”门槛；试用反馈 |
| 协议 schema 变严，无效输出和重试增多，等待变长 | T6 报告首次有效率和重试率；必要时放宽告警类规则，不放宽权限类规则 |
| 模型声明的帮助级别与实际不符 | 代码只能保证不超过上限；是否属实由 T6 判定抽查（设计 §8.2） |
| 模型选错 `track` | 记录 `track`；T6 加入专门用例；第二阶段改为从分类码确定 |
| 用 `source` 代替改述，提纲文字变长、变口语 | 学生仍可编辑提纲；试用中观察 |
| 默认英文讲解影响基础较弱的学生 | 用户中心可以切换；首次提示；试用中统计切换率 |
| 负责人既定规则又判定评测 | 盲审包不含配置；逐例理由公开给创始人；拿不准的按越界计 |
| 确认项按先进先出归档，可能归档仍然相关的事 | 归档项保留在状态中、可在调试中查看；T6 加入长对话用例 |
| 调用内容表增长 | 90 天清理；T1 报告估算每篇练习的体积 |
| 真实模型评测费用超出预期 | dry-run 估算（含重试）；单次 ¥50 上限 |

## 9. 与旧方案的关系

| 旧方案（风格档位开发方案） | 处理 |
|---|---|
| WP0 提示词抽取 | 已完成（`90f5655`） |
| WP1 调用记录（LG-01～LG-06） | 继承为 T1，LG-03 的字段按本方案修改 |
| WP2 PDF 导出 | 推迟，降低优先级（设计 §14.1） |
| WP3 五层提示词（A1） | 由 T2 替换：保留“批改与速刷不变”和行为评测的要求；不做风格层和长度对比 |
| WP4 风格（A2） | 推迟（设计 §14.1） |
| WP5a/b/c 档位 | 推迟；只有配置记录提前到 T1（AT-01） |
| WP6 上线检查 | 由本方案 §5 替换 |
| W0-3、W0-4、W0-5 | 本阶段不需要 |

## 10. 审阅记录

2026-11-03，实现者对 v1 的 P-3 审阅，结论“修改后同意”。处理如下：

| # | 意见 | 处理 |
|---|---|---|
| 1 | 只看 move 和 payload，无法确定性地区分 A1 与 A2；schema 工厂拿不到当前线程 | 模型声明 `help.level`，代码校验不超过上限，`suggest` 固定为 3（附录 A.3，设计 §8.2 同步修订）；schema 工厂接收线程并预演整批增量（AT-16） |
| 2 | 线程协议缺少可执行定义 | 新增附录 A：完整类型、转移表、move 与 payload、输入输出样例；`close` 改为 `delta.close`；`read-session` 的未来版本与损坏处理（AT-13） |
| 3 | B0 与回滚边界 | 旧 schema 不改，新输出用独立 schema；`finish` 继续用 `coached()`；`syncIssueLevels`；开→关→开测试；B0 限定为固定输入 |
| 4 | 配置记录不等于执行快照 | AT-15：执行快照冻结在 `pendingAction.tutor` |
| 5 | 遗漏晚到结果作废规则 | AT-17 与附录 A.4；“状态不变”限定范围（§3 第 20 条） |
| 6 | 无文字的 `more` 进不了现有动作链 | AT-19 |
| 7 | 示范句卡片要覆盖整条采用链 | AT-23 |
| 8 | AT-11 与设计 §10.4 冲突 | 负责人选择“用 `source` 代替改述”，并先修订设计（v1.3） |
| 9 | 偏好存储、段落提醒、首次提示的依据 | AT-09 原始值与有效值分开；AT-10 增加段落提醒默认值；AT-11 依据实际回复的语言 |
| 10 | 帮助事件与告警的契约不完整 | 附录 A.5；告警接口提前到 T1（AT-02）；`suggest` 不豁免告警 |
| 11 | 阶段切换不能靠简单串联 | AT-25：`startRevision({ openIssue })` |
| 12 | 评测证据不足以证明门槛 | AT-27 增加两类用例；盲审包含多轮历史和卡片内容；AT-30 的汇总规则 |
| 13 | 估时与拆分 | 重排为 T1～T6，T6 拆为 a/b/c，不承诺固定总工期 |

2026-11-03，实现者对 v2 的确认审阅，结论“修改后同意”。原 13 条中 1、7～11、13 已解决；2～6、12 部分解决，对应下列 7 处，v3 全部按实现者给出的替换文字采纳：

| # | 问题 | v3 处理 |
|---|---|---|
| ① | 题目没有“必填槽位”标记，按槽位推导写前目标会重新引入填满槽位的要求 | 写前目标固定为“围绕题目整理学生自己的回答”（A.2） |
| ② | `confirm + close` 按校验规则永远非法；未禁止非 `suggest` 携带建议 | 局部确认用 `confirm`；达标用 `check_attempt + recordAttempt(met) + clearQuestion + close`；补两个样例（A.3） |
| ③ | 确认项可以记入模型的归纳；先进先出与设计的“关键项”冲突 | `establish.text` 必须是原话片段；第一阶段明确先进先出，设计 §8.4 同步修订 |
| ④ | 执行快照与“开关关闭拒绝请求”冲突；作废后学生文字会丢 | 开关只决定新请求；作废时保留输入、标记不可重试（AT-15）；设计 §14.1 同步修订 |
| ⑤ | 来源被直接删除或改写时晚到检查发现不了 | 逐项核对实际用到的来源（A.4）；补三类交错用例 |
| ⑥ | 只有单向同步，重新开启后线程状态过期 | `lastMessageId` 与 `reconcileLegacy`（AT-20） |
| ⑦ | `more` 的升级本轮不生效；无文字请求仍有 `cur` | 调用前在临时线程上升级；无文字请求不提供 `cur`；提示消息不作证据（AT-19） |

---

## 附录 A 线程协议

### A.1 类型（第一阶段子集）

```ts
type Help = 0 | 1 | 2 | 3;
type Track = "argument" | "language";
type Move = "ask" | "clarify" | "explain" | "hint" | "check_attempt" | "confirm" | "suggest" | "invite_write" | "noop";

type Established = {
  id: string;            // 服务器生成
  text: string;          // 所引学生消息的连续原话片段，≤ 200 字符
  refMessageId: string;  // 学生消息的 id
  basis: "student_stated";   // 第一阶段只有这一种；student_confirmed 留到第二阶段
  archived: boolean;     // 超出上限后归档，不进入线程视图
  retracted: boolean;    // 学生纠正后撤回
};

type Attempt = {
  messageId: string;
  result: "met" | "partial" | "not_met" | "unclear";
  reason: string;        // ≤ 300 字符
  help: Help;            // 本轮实际帮助
};

type TeachingState = {
  v: 1;
  key: string;           // "prewrite" | "issue:<rank>"
  status: "open" | "closed";
  closedReason: "met" | null;
  track: Track;
  current: { target: string; refs: string[] } | null;   // 由代码设置，见 A.2
  openQuestion: { text: string; askedMessageId: string } | null;
  established: Established[];   // 未归档且未撤回的 ≤ 8
  attempts: Attempt[];           // ≤ 3，先进先出
  allowedHelp: Help;
  providedHelp: Help | null;     // 历史最高；null 表示未知（旧数据）
  legacyLevel: 1 | 2 | 3 | null;
  lastMessageId: string | null;  // 最后处理的消息，用于 reconcileLegacy
};

type HelpEvent = { /* 见 A.5 */ };

type TutorState = {
  v: 1;
  brief: null;                   // 第二阶段才有
  activeThread: string | null;
  threads: Record<string, TeachingState>;
  helpEvents: HelpEvent[];       // ≤ 200
};
```

设计 §8.1 中的 `next` 字段和 `student_confirmed` 在第一阶段不使用。

### A.2 转移表

| 事件 | 处理（由代码完成） |
|---|---|
| 第一次写前请求 | `openThread("prewrite", "argument", allowedHelp = 0)`；`current.target` 固定为“围绕题目整理学生自己的回答”，`refs` 为空。第一阶段不从提纲槽位推导必填项，也不以槽位填满作为收束条件 |
| 第一次打开问题 rank | `openThread("issue:<rank>", 模型输出的 track, allowedHelp = 1)`；`current.target` 为问题标题，`refs` 为问题的原句编号 |
| 旧会话第一次打开问题 rank | `fromLegacy`：`legacyLevel = allowedHelp = issueLevels[rank] ?? 1`，`providedHelp = null`；`track` 由模型在本次输出 |
| 学生转到另一个线程 | `activeThread` 改为新键；原线程状态不变（不关闭） |
| 学生回到已关闭的线程 | `reopenThread`：`status = "open"`，`closedReason = null`，其他保留 |
| 升级上限 | 写前最高 2，问题线程最高 3 |
| `ask`、`attempt` 成功 | 不改 `allowedHelp` |
| 有效确认项超过 8 条 | 最早的未归档项 `archived = true`（先进先出）。归档项不进入线程视图；第一阶段不判定“关键项”，也不承诺保留它们（设计 §8.4 v1.3） |
| 尝试超过 3 条 | 丢弃最早的一条 |
| 写前或问题 `intent: "more"` | 调用前在临时线程上 `escalate`，本轮生成与预演都用升级后的上限；成功才写入（AT-19） |
| 开关关闭期间有新交互，重新开启后打开线程 | `reconcileLegacy`（AT-20） |
| 调用成功 | `providedHelp = max(providedHelp ?? 0, help.level)`；更新 `lastMessageId`；问题线程调用 `syncIssueLevels` |

### A.3 模型输出

```ts
type TutorOutput = {
  move: Move;
  reply: string;                       // 现有长度上限
  help: { level: Help };               // 本轮实际给出的帮助
  track?: Track;                       // 仅在 newThread 时必须提供，其他时候不能出现
  delta: DeltaOp[];                    // ≤ 6
  payload: { outlineUpdates?: OutlineUpdate[]; suggestion?: { suggestedText: string; reason: string } };
};

type DeltaOp =
  | { op: "establish"; text: string; ref: string }          // ref 为本次提供的引用键
  | { op: "retract"; establishedId: string; ref: string }
  | { op: "ask"; text: string }
  | { op: "clearQuestion" }
  | { op: "recordAttempt"; ref: string; result: Attempt["result"]; reason: string }
  | { op: "close"; reason: "met" };
```

**引用键**：上下文中每条学生消息（窗口内、`action` 不是 `hint`）分配引用键 `m:<messageId>`；本次学生输入有文字时引用键为 `cur`，保存后映射为新消息的 id；无文字的 `more` 请求没有 `cur`。引用键在同一次请求的重试之间保持不变，因为它们由请求开始前的状态生成。

**校验规则**（上下文权限写入模型可见的动态 schema；跨字段约束及增量预演由 `superRefine` 校验）：

| 规则 | 写前 | 问题线程 |
|---|---|---|
| 允许的 move | ask、clarify、explain、hint、confirm、invite_write | ask、clarify、explain、hint、check_attempt、confirm、suggest |
| `help.level` | ≤ `allowedHelp`；`suggest` 时必须为 3 | 同左 |
| `suggest` 与 `payload.suggestion` | 都不允许 | `suggest` 只在 `allowedHelp = 3` 时允许；`payload.suggestion` 只有 `suggest` 能带，并且 `suggest` 必须带 |
| `payload.outlineUpdates` | 允许 | 不允许 |
| `ask` 操作 | 每次最多一个；问题是线程状态更新，可与任意允许的教学 move 同用 | 同左；同轮含 `close` 时禁止 `ask` |
| `recordAttempt` | 不允许 | 只在 move 为 `check_attempt` 时允许；`ref` 必须是 `cur`；同一条消息只记一次 |
| `close` | 不允许 | 只在 move 为 `check_attempt`、本轮 `recordAttempt.result = "met"`、并且同时有 `clearQuestion`、没有任何 `ask` 时允许，四者一起提交，关闭后不得留有开放问题 |
| `confirm` | 局部确认，不能带 `recordAttempt` 或 `close` | 同左 |
| `establish` | `ref` 必须是本次提供的键；`text` 必须是该消息的连续原话片段 | 同左 |
| `retract` | `ref` 必须是本次提供的键；对象必须存在且未撤回 | 同左 |

**样例 1：局部确认**（问题线程，学生答对了一个中间问题，线程不关闭）：

```json
// 线程视图（输入的一部分）
{ "key": "issue:2", "track": "language", "allowedHelp": 1,
  "current": { "target": "主谓一致" },
  "openQuestion": { "text": "这句的主语是什么？" },
  "established": [], "attempts": [] }
// 当前学生输入 cur："两个谓语都对应 This，所以要用 seems 和 makes。"
// 合法输出
{ "move": "confirm", "help": { "level": 0 },
  "reply": "对，This 是单数，两个动词都要加 -s。把这句改好后发给我看看。",
  "delta": [ { "op": "establish", "text": "两个谓语都对应 This", "ref": "cur" },
             { "op": "clearQuestion" } ],
  "payload": {} }
```

**样例 2：核验达标并关闭线程**（接上例，学生发来改写后的句子）：

```json
// 当前学生输入 cur："This seems easy but makes students tired."
// 合法输出
{ "move": "check_attempt", "help": { "level": 0 },
  "reply": "改对了：seems 和 makes 都和 This 一致。这个问题解决了。",
  "delta": [ { "op": "recordAttempt", "ref": "cur", "result": "met", "reason": "两个谓语都已改为单数形式" },
             { "op": "clearQuestion" },
             { "op": "close", "reason": "met" } ],
  "payload": {} }
```

### A.4 晚到结果检查

保存前重新读取用户资料和会话，以下任何一项不符合，就作废整次结果（处理方式见 AT-15）：

1. **实际用到的来源仍然有效：** 本次请求 `learner.difficulties` 中的每一项，现在仍在 `profile.difficulties` 中、内容没有改变，并且不在 `excludedMemoryIds` 中。学生直接删除、改写或停用其中任何一项，都算不符合。
2. 线程键对应的线程没有被其他请求修改（以线程内容的哈希判断）。
3. 会话的 `version` 没有被其他请求推进。比较基准是 `pendingAction` 落库后的版本，排除本请求自己的版本递增（现有会话锁下不应发生，作为防御检查）。

讲解语言的变化不触发作废：本次请求按快照（AT-15）完成，下一次请求使用新语言。

### A.5 帮助事件

```ts
type HelpEvent = {
  id: string;
  at: string;
  entry: "prewrite" | "chat" | "clarify" | "polish" | "express" | "check" | "issue" | "nudge";
  essayKind: "original" | "revision" | null;   // 写前为 null
  draftVersion: number;                         // 接受请求时的会话 version
  level: Help | null;                           // 本轮实际帮助；未接入协议的入口为 null
  track: Track | null;                          // 未接入协议的入口为 null
  suggestionIds: string[];                      // 本轮生成的建议卡片
  messageId: string | null;                     // nudge 为 null
};
```

- `nudge` 返回 null（没有提醒）时不记事件；有提醒时记一条，`messageId` 为 null。
- 线程的 `providedHelp` 是历史最高值；事件的 `level` 是这一轮的实际值。
