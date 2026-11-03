# 开发方案：教练风格、模型档位与练习导出

* **负责人（方案、建议、验收）：** Claude Code
* **实现者：** Codex gpt-6-astra
* **日期：** 2026-11-03
* **状态：** 草案 v1，等待实现者审阅（第 9 节）。WP0（提示词抽取）已由负责人完成，待提交。

## 0. 依据与范围

开发依据。两份文件冲突时，以排在前面的为准：

1. [RFC](../designs/tutor_style_tiers.md)：**唯一的行为依据**。下文的"RFC §n"都指这份文件。
2. [原型/90_共享规范.md](../../原型/90_共享规范.md)：会话 JSON 字段、读写规则、`llm_calls` 的约定。
3. [原型/91_前端布局.md](../../原型/91_前端布局.md)：页面位置。
4. 上一轮开发方案 [2026-11-01_question_bank_dev_plan.md](2026-11-01_question_bank_dev_plan.md) 第 3 节的实现约定，本方案继续沿用（见第 3 节）。

**范围：** RFC §11 的 W0、阶段 0、E、A1、A2、B，以及上线检查。

**不在范围内：** B′（换成不同的模型、盲测、自动降档）；定价；速刷接入风格或档位；速刷卡片导出；改动 `data/question-bank/`。

**条目编号：**

| 前缀 | 内容 |
|---|---|
| PR | 提示词文件 |
| LG | 调用记录 |
| EX | 导出 |
| ST | 风格 |
| TR | 档位与批改配置 |
| RL | 上线 |

## 1. 分工与流程

| 角色 | 职责 |
|---|---|
| 负责人 | 写方案；回答实现中的问题；每个工作包结束时审阅改动、运行检查、按验收用例验收；通过后提交 |
| 实现者 | 审阅本方案并提出异议；按工作包实现；**完成全部测试，包括浏览器和端到端验证**，把结果写进报告；文档没写清楚的产品行为先提问，不自行决定；**不提交（commit）** |
| 创始人 | 产品决定；批准新依赖；批准提交与合并 |

每个工作包的流程：

1. 负责人发出工作包，内容是本方案的一节加上条目编号。提示词放在 `docs/plans/tasks/TS-WPn_prompt.md`。
2. 实现者在分支 `tutor-style-tiers` 上实现，运行第 6 节的检查，把报告写到 `docs/plans/reports/TS-WPn.md`。报告内容包括：改了哪些文件、哪些用例通过、还有什么没做或有疑问。
3. 负责人验收（第 7 节）。不通过时写出必须修改的点，实现者修正后再验收。
4. 验收通过后由负责人提交，提交说明里写上条目编号。

一个工作包所依赖的工作包，要先验收通过，它才能开始。

## 2. 开工前提（W0）

- **W0-1 提交基线**（负责人，需创始人批准）：把 WP0 的改动、RFC、本方案、`concepts_brief_tutor.md` 和 Goldfish 报告提交到 `tutor-style-tiers` 分支。
- **W0-2 基线检查**：2026-11-03 已在 WP0 的改动上运行，结果全部通过：`npm run lint`、`npm run typecheck`、`npm test`（178 项）、`npm run test:ui`（41 项）、`npm run test:db`、`npm run build`。
- **W0-3 生产数据**（负责人或创始人）：在生产数据库的最新备份上，只读地统计每个对话类调用点的教练回复长度，得到中位数和 p90。按 `stage` 和 `action` 分组，参照 RFC §1 的查询口径。把结果写进 RFC §6.3 和 §6.5。**WP3 开始前必须完成。**
- **W0-4 新依赖**（创始人批准）：WP2 需要一个 PDF 生成库和一个中文字体文件，后者会让仓库增加约 10 MB。实现者在 WP2 开始前提出具体的库和字体，并说明许可证、体积、是否需要加入 `serverExternalPackages`。批准后才能安装。
- **W0-5 校准作文**（创始人）：准备 20 篇作文，覆盖 5～8 分，作为批改的校准集。WP5a 只搭工具；校准集可以在 WP5a 之后再补齐，但必须在第一次更换批改模型之前就位。
- **W0-6**：本方案经实现者审阅，双方达成一致。

## 3. 实现约定（所有工作包）

上一轮方案第 3 节的 1～10 条继续适用：先读 `AGENTS.md` 和 `node_modules/next/dist/docs/`；沿用现有代码风格；新表只走追加迁移；规则函数是纯函数，要有单元测试；模型调用放在事务之外；不加新依赖（例外是 W0-4 批准的依赖）；不批量改写旧会话；新功能都放在默认关闭的开关后面；界面文字用简体中文。

本轮新增：

11. **提示词只能放在 `prompts/` 下。** 不能在 TS 代码里写新的提示词字符串。改了任何 `.txt` 都要升级 `promptConfigVersion`，并更新 `tests/prompts.test.ts` 里的哈希。
12. **批改和速刷的请求逐字节不变**，除非工作包明确要求改动。每个工作包都要用测试证明这一点（第 4 节 WP1 会建立这项测试）。
13. **调用内容和提示词绝不离开服务器。** 任何接口返回、页面、导出文件、报错信息和日志里，都不能出现 `llm_call_payloads` 表里的数据或提示词原文。
14. **需要真实模型的验证**（行为用例、档位实测）用单独的脚本运行，不放进 `npm test`。脚本的输出和花费写进报告。不能用生产环境的 key 做压力测试。
15. 新的 `llm_calls` 字段一律允许为空。不修改已有的 CHECK 约束。

## 4. 工作包

依赖关系：WP0 → WP1 → WP3 → WP4；WP1 → WP5a → WP5b；WP2 只依赖 W0-4，可以和其他工作包同时进行；WP6 放在最后。

### WP0 提示词抽成文件（PR-01，已完成）

- `prompts/{system,coach,judge,quick}/*.txt` 共 16 个文件；读取模块 `lib/llm/prompts.ts`；调用方 `engine.ts`、`quick-model.ts`、`messages.ts` 已改为读取文件。
- 证据：用脚本从当前 HEAD 的源码里取出每段字符串的原文，和新文件的内容逐段比对，并在 3 种重试情况下比对拼装出的完整 system 消息，全部逐字节一致；`.next/static` 里没有任何提示词文字；`tests/prompts.test.ts` 共 4 项。
- 验收：负责人已完成，等 W0-1 提交。

### WP1 调用记录与调用点表（LG-01～LG-05）

- **LG-01 调用点表。** 新建 `lib/llm/call-sites.ts`，用 `Record<CallSite, { purpose, group }>` 实现 RFC §3 的表。`llmPurposes` 增加 `writing_check`、`memory_summary`；`diagnosis`、`idea_extract`、`opening` 保留但不再使用。
- **LG-02 精练调用都传 options。** `runAction` 增加参数 `ctx: { userId, operationId }`，`operationId` 取路由的 `requestId`。`app/api/sessions/[id]/actions/route.ts` 和 `lib/pipeline/retry-review.ts` 都要传进来。8 个调用点都传 `{ purpose, userId, sessionId, operationId }`，加上新增的 `callSite`。
  - 注意 `client.ts:77` 的 `!options` 分支：传了 options 之后，超时会按另一种方式分类。保持学生看到的报错文字不变，并补测试。
  - 除此之外，模型调用的行为不变：请求体、输出上限、超时和重试次数都和现在一样。
- **LG-03 `llm_calls` 新字段。** 加入 RFC §4.2 的全部字段，都允许为空，不改 CHECK 约束。同步修改 `CallRecord`、插入语句（`calls.ts:32-33`）、元数据 zod schema（`calls.ts:25`），以及 `consumeReservation` 的字段比对。这一阶段只写入 `call_site`、`stage_group`、`provider`、`prompt_version`、`finish_reason` 和 `reasoning_tokens`（`readUsage` 要读取 `completion_tokens_details.reasoning_tokens`，如果供应商返回的话）。其余字段等 WP4、WP5a 再写入。
- **LG-04 `llm_call_payloads` 表。** 字段：`call_id`（主键，外键指向 `llm_calls.id`，级联删除）、`user_id`（外键指向 `users`，级联删除）、`session_id`、`created_at`、`expires_at`（创建后 90 天）、`request_json`、`response_text`。索引：`(expires_at)`、`(user_id, session_id)`。
  - 调用结束后写入，成功或失败都写；写入失败不影响这次调用。
  - 写入时顺带删除最多 500 条已过期的记录；`instrumentation.ts` 启动时也清理一次。
  - 不保存 `reasoning_content`。
  - 删除练习时（`lib/db/queries/sessions.ts` 的 `deletePracticeContent`）同时删除这次练习的调用内容。
  - 速刷调用也写入。
- **LG-05 消息关联调用。** `CoachMessage` 增加可选字段 `callId`（`lib/prototype/types.ts`）。精练的教练消息写入这个字段。旧消息没有这个字段，照常显示。

**验收测试**

- 8 个精练调用点和 2 个速刷调用点各发一次调用（使用假 fetch），每次都有一行 `llm_calls`，`call_site`、`purpose`、`stage_group` 都正确。
- 新增 `tests/request-parity.test.ts`：对每个调用点，比较这次改动前后发给 fetch 的请求体，必须逐字节一致。用固定的会话样例和固定的 `requestId`。这个测试之后一直保留，WP3～WP5 都靠它证明"批改和速刷的请求不变"。
- 超时、供应商报错、不合格输出、输出被截断（`finish_reason=length`）这四种情况，`outcome` 和 `finish_reason` 都记录正确；学生看到的报错文字和改动前一样。
- 调用内容：成功和失败的调用都写入；写入失败（用触发器模拟）时，调用仍然成功；过期记录被清理；删除练习后，这次练习的调用内容为空；删除账户后，这个用户的调用内容为空。
- 全仓库没有任何接口返回调用内容表的数据：用一个测试检查 `app/` 下没有任何文件引用调用内容的查询模块。
- `scripts/test-db.ts`：在有数据的数据库上做迁移，已有的 `llm_calls` 记录（包括 `reserved` 状态的）保持不变，新字段为空。

### WP2 练习导出 PDF（EX-01～EX-04）

开始前必须先完成 W0-4（新依赖获得批准）。

- **EX-01 文档模型。** `lib/export/practice-document.ts`：一个纯函数，把 `SessionState` 转成文档模型，即一组段落（标题、正文、分数表、列表），内容按 RFC §9。这个函数不碰任何内部字段：不包含模型、档位、风格、id、`callId`。
- **EX-02 PDF 渲染。** `lib/export/render-pdf.ts`：把文档模型渲染成 PDF，嵌入中文字体的子集。版式简单就行：A4 页面，标题、小标题、正文，加上页码。
- **EX-03 接口。** `GET /api/sessions/[id]/export`：使用 `runtime = "nodejs"`；`requireApiUser`；用 `getSession(user.id, id)` 读取；不是自己的练习或练习不存在都返回 404；速刷练习返回 409 `unsupported_session`。响应头按 RFC §9。放在 `EXPORT_ENABLED` 开关后面，开关关闭时返回 404。
- **EX-04 入口。** 作文页反馈之后的各阶段，以及作文库，都加上"导出 PDF"按钮，并附上微信内置浏览器的提示。

**验收测试**

- 文档模型：对 4 种会话样例分别测试：只有原稿；有改写和对比；模考；包含英文讲解的会话。各段落齐全；对文档模型做 JSON 序列化后，结果里不包含任何内部字段名，也不包含提示词片段（取每个提示词文件的前 40 个字符来检查）。
- 接口：未登录返回 401；别人的练习返回 404；速刷练习返回 409；开关关闭时返回 404；成功时响应头正确，内容以 `%PDF` 开头。
- 实现者把生成的 PDF 渲染成图片附在报告里：中文、英文和标点都显示正确，没有方框乱码；长作文能正确分页。
- 浏览器：在桌面和手机宽度下点击按钮，都能下载文件。

### WP3 提示词五层结构（ST-01～ST-03，即 A1）

开始前必须先完成 W0-3（生产数据）。

- **ST-01 新文件。**
  - `prompts/system/coach-preamble.txt`：L0 加 L1，按 RFC §6.1 和 §6.2。
  - `prompts/style/<调用点>/standard.txt`：对 `prewrite`、`chat`、`clarify`、`issue` 四个调用点各写一个，内容就是从现有指令里移出来的详略措辞。
  - 修改 `prompts/coach/{prewrite,chat,clarify,issue}.txt`，去掉其中所有关于详略的措辞。
  - 修改 `prompts/coach/nudge.txt`，让它使用新的 preamble，但不加风格段。
  - **不改** `prompts/judge/*`、`prompts/quick/*` 和 `system/preamble.txt`。
- **ST-02 拼装。** `buildMessages` 增加一个参数，用来选择 preamble 和可选的风格段。对话类调用按 RFC §6.1 的顺序拼装；批改和速刷仍然走现在的拼装方式。估算输入长度时，要用包含风格段在内的完整消息。
- **ST-03 长度硬上限。** 每个对话类调用点各自使用一个 schema，`reply` 的最大长度采用 W0-3 校准后的数值（RFC §6.5）。
- 升级 `promptConfigVersion`（例如 `coach-json-v5-layers`），并更新提示词哈希测试。
- **ST-04 行为评测脚本。** 新建 `scripts/verify-coach-behavior.ts`，需要真实模型。用例放在 `data/coach-cases/*.json`（新文件）。评测方式：由一个模型按 C1～C5 的评分表打分，并统计回复长度。可以参考 `scripts/verify-quick-behavior.ts`。输出一张表：每个用例在每种配置下的违规次数，以及长度的中位数。WP4 和 WP5 也会用这个脚本。

**验收测试**

- `tests/request-parity.test.ts`：批改调用点和速刷调用点的请求体逐字节不变。
- 拼装：对话类调用的 system 消息依次包含 L0、L1、Schema、L3、L4，顺序正确；每个对话类调用点的 L3 文件里都不再含 `concise`、`brief`、`short` 这类详略措辞（用测试检查关键词）。
- `verify-coach-behavior.ts`：用 RFC §6.7 A2 列出的那几类用例，至少 20 个，在新旧两版提示词下各跑 3 次。C1～C5 违规次数不增加，回复长度中位数的变化不超过 ±20%。报告里附上对比表和花费。
- 回复超过硬上限时，按现有的"格式错误"流程重试一次，学生看到的报错文字不变。

### WP4 风格（ST-05～ST-08，即 A2）

- **ST-05 风格文件。** 为四个调用点各写 `concise.txt` 和 `comprehensive.txt`，按 RFC §6.3 和 §6.4 编写，共 8 个文件，可以放在 `prompts/style/` 下。在 `lib/llm/prompts.ts` 的名称列表里登记，并设立独立的 `styleVersion`。
- **ST-06 设置。** 在 `profile_json` 里加 `tutorStyle`，修改 `DEFAULT_PROFILE` 和 `profilePatchSchema`。账户页加"回复风格"选项（Concise · 简短 / Standard · 标准 / Comprehensive · 详细），放在 `STYLES_ENABLED` 开关后面。
- **ST-07 练习中切换。** 新增动作 `setTutor`（RFC §10.2），先只支持 `style` 和 `makeDefault`，档位部分在 WP5b 补上。会话增加 `tutorOverride` 字段。每次模型操作在创建时解析出要用的风格，后面不再改变。教练消息记录 `styleId`；切换之后在对话里显示一条分隔线。
- **ST-08 记录。** 在 `llm_calls` 里写入 `style_id` 和 `style_version`。

**验收测试**

- `verify-coach-behavior.ts`：达到 RFC §6.7 A2 的全部标准。跨档位的组合（Comprehensive × Sage）放到 WP5a 之后再补测。
- 生效顺序：账户设置为 concise、本次练习切换为 comprehensive 时，下一次调用用 comprehensive；关闭 `STYLES_ENABLED` 时用 standard，`llm_calls` 也记录 standard。
- 冻结：模型调用进行中调用 `setTutor`，这次调用仍然用原来的风格，下一次才用新的风格。
- `profilePatchSchema` 拒绝未知的风格值；`profile_json` 里存了未知的值时，读取结果是 standard，原值保留。
- 回滚：用 WP3 验收通过时的代码，打开含 `tutorOverride` 的会话，能正常显示和操作。
- 浏览器：在账户页切换风格；练习中切换风格并看到分隔线；手机宽度和深色模式下显示正常。

### WP5a 档位对照表与批改配置（TR-01～TR-06）

- **TR-01 对照表。** 新建 `lib/llm/tiers.ts`，按 RFC §7.2 实现。设立 `tierTableVersion`。每个档位的 `maxTokens` 和 `timeoutMs` 按调用点设置；初始值先沿用现在的 16,000 和 120 秒，TR-06 实测后再改。
- **TR-02 批改配置。** 新建 `lib/llm/judge.ts`，每个批改调用点一行（RFC §8）。设立 `judgeVersion`。读取现有的 `LLM_*` 环境变量。`quick.check` 保持关闭思考。
- **TR-03 解析。** 实现 `resolveCallConfig(callSite, { profile, override, flags })`，返回 `{ model, baseUrl, apiKey, params, maxTokens, timeoutMs, servedTier, requestedTier, versions }`。规则：
  - 批改组和速刷组忽略档位；
  - 段落提醒拒绝 Sage，改用 Mentor；
  - 所选档位被停用时用 Mentor；
  - `TIERS_ENABLED=false` 时返回和现在完全相同的设置，不传推理参数。
  - 合并 `quickProviderOptions` 里的供应商判断，让判断逻辑只有一个来源。`client.ts` 改为使用解析出来的设置。
- **TR-04 护栏。**
  - 每个用户每天的精练输出 token 上限：超过时返回 429，报错文字说明原因，并告诉学生"你的文字已保留"；
  - 每个档位一个环境变量开关；
  - 启动时检查每个档位的配置；
  - Sage 并发上限，在 `admission.ts` 里实现。
- **TR-05 记录。** 在 `llm_calls` 里写入 `requested_tier`、`served_tier`、`params_hash`、`tier_table_version`、`judge_version`。每份评分结果（`evaluation`、`revisionScores`、`comparison`）都记录 `judgeVersion` 和模型名。
- **TR-06 实测脚本。** 新建 `scripts/verify-tiers.ts`，需要真实模型：
  - 每个档位调用一次，必须返回 200 且 `finish_reason` 为 `stop`；
  - 显式传 `reasoning_effort: high` 和不传各跑 5 次，比较 token 数和回复长度；
  - 每个"档位 × 对话类调用点"组合至少调用 20 次，记录输出 token 的 p99 和延迟的 p95。按 p99 × 1.3 定出 `maxTokens`，写回对照表。
- **TR-07 校准工具。** 新建 `scripts/judge-calibrate.ts`：用指定的批改配置，给 `data/judge-calibration/*.json`（W0-5 提供的作文）打分，并和保存的基准分数比较，输出平均偏移和单篇最大偏移。没有校准集时，脚本给出明确提示后退出。

**验收测试**

- `tests/request-parity.test.ts`：`TIERS_ENABLED=false` 时，全部调用点的请求体逐字节不变。
- 解析规则：对 RFC §7.3 列出的每一种默认情况，以及段落提醒选了 Sage、档位被停用、批改调用点、速刷调用点，都有单元测试。
- 打开开关后：Adept、Mentor、Sage 分别发出 `low`、`high`、`max`；推理参数只发给 `api.deepseek.com` 上的 `deepseek-*` 模型，发到其他地址时不带这些参数。
- 护栏：超过每日上限时返回 429，报错文字正确；Sage 达到并发上限时，Adept 和 Mentor 不受影响。
- `verify-tiers.ts`：报告里附上实测表格，包括每档每个调用点的 token p99、延迟 p95、截断率和每次练习的估算成本，以及显式传 `high` 和不传的比较结论。
- 跨档位安全：Comprehensive × Sage 组合跑一遍 WP4 的对抗用例，C1～C5 违规 0 次。

### WP5b 按环节选档位的界面与切换（TR-08～TR-10）

- **TR-08 账户设置。** 账户页加"各环节的教练档位"：写前构思、写作协助、改写辅导、段落提醒（只有 Adept / Mentor）。旁边说明"速刷固定使用快速模式"，以及"批改：固定配置，所有人相同，以保证评分公平"。提供"恢复默认（全部 Mentor）"。界面上写明"三档目前是同一模型的不同思考深度"，并显示每档的预计等待时间（用 TR-06 的实测数据）。放在 `TIERS_ENABLED` 开关后面。
- **TR-09 练习中切换。** 教练面板顶部显示当前环节的档位，可以切换；还有"同时设为默认"的选项。`setTutor` 支持 `tiers` 字段。切换之后在对话里显示分隔线，例如"已切换为 Sage · 深度"。
- **TR-10 等待状态。** 模型调用进行中显示"思考中"；Sage 的调用显示预计等待时间。报错信息里写出档位名，并保留"你的文字已保留"。

**验收测试**

- 生效顺序：本次练习切换 > 账户设置 > Mentor。分别在写作阶段和改写阶段切换，确认作用在正确的环节上。
- 上下文：切换档位前后，同一个调用点发出的上下文完全相同（用假 fetch 比较请求体中的 messages），只有模型参数不同；历史消息里不带档位或风格标签。
- 冻结：调用进行中切换，正在进行的调用不受影响。
- 浏览器：按"写前构思用 Sage → 写作中切到 Adept → 提交 → 改写辅导用 Mentor"走一遍，检查每一步的 `llm_calls` 记录；手机宽度和深色模式下显示正常；开关关闭时界面和现在相同。

### WP6 上线检查（RL-01～RL-03）

- **RL-01** 所有开关都关闭时：旧功能正常；旧练习能打开；`tests/request-parity.test.ts` 通过；`npm run check` 通过。
- **RL-02** 回滚演练：在 WP1 验收通过时的代码上，打开 WP5b 之后产生的数据（包括有 `tutorOverride` 和 `callId` 的会话、带新字段的 `llm_calls`、调用内容），确认读取正常，新表和新字段都还在。
- **RL-03** 打开顺序：`EXPORT_ENABLED`（可以随时打开）→ `STYLES_ENABLED` → `TIERS_ENABLED`。每打开一个开关，都运行一次对应的冒烟检查。上线前，隐私说明里加上调用内容保存 90 天的说明，措辞由创始人确认。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 传入 options 后超时的分类变了，报错文字也跟着变 | WP1 专门写测试，保证学生看到的报错文字不变 |
| 调用内容表增长太快，备份变大 | 90 天后清理；WP1 报告里估算每次练习的体积 |
| 去掉详略措辞之后，Standard 的回复变长 | A1 单独验收，长度变化不超过 ±20% |
| `deepseek-flash` 不接受 `reasoning_effort` | TR-06 第一项就验证；如果不接受，暂停 WP5a，由创始人决定改用 `thinking` 开关还是换模型 |
| Sage 截断或超时太多 | 按实测的 p99 设预算；截断率写进报告；不达标时关闭 Sage |
| PDF 库在 Next 里被打包后读不到自己的字体或数据文件 | 加入 `serverExternalPackages`；WP2 报告里说明 |
| 微信里无法下载 PDF | 按钮旁边提示用浏览器打开；报告里记录在微信中的实际表现 |
| 用于评测的真实模型调用花费超出预期 | 每个脚本先估算花费，写进报告；单个工作包超过 ¥50 时先问负责人 |

## 6. 每个工作包的自测（实现者运行）

```text
npm run lint
npm run typecheck
npm test
npm run test:ui
npm run test:db
```

有界面或接口改动的工作包，还要在临时数据库上做端到端验证，把截图或日志写进报告。需要真实模型的脚本（`verify-coach-behavior.ts`、`verify-tiers.ts`）单独运行，报告里附上输出和花费。WP6 另外运行 `npm run check`（包含构建），并重复 WP0 的检查：`.next/static` 里没有提示词文字。

## 7. 验收（负责人执行）

1. 阅读全部改动，对照 RFC 和条目编号，逐条检查第 3 节的约定。
2. 自己重跑第 6 节的命令。
3. 按对应的验收测试，逐条核对实现者提交的证据，包括测试名、日志、截图和评测表。全部测试由实现者完成，负责人只审阅证据，必要时重跑第 6 节的命令。
4. 结论三选一：通过；修改后通过（列出必须修改的点）；不通过（说明原因）。
5. 通过后，由负责人提交。

## 8. 审阅记录

（等待第一轮实现者审阅。）

## 9. 请实现者确认

1. RFC 和本方案之间，有没有矛盾或无法照写实现的地方？请逐条给出位置。
2. 工作包的拆分和依赖关系是否合理？有没有哪个工作包太大？
3. WP1 的 `tests/request-parity.test.ts` 能否在现有的测试工具上实现？如果需要固定 `crypto.randomUUID` 或时间，请说明打算怎么做。
4. WP2 打算用哪个 PDF 库和哪个字体？说明许可证、体积，以及是否需要改 `next.config.ts`。
5. 如果没有阻塞项，请回复 READY；W0 的各项完成后，WP1 就可以开始。
