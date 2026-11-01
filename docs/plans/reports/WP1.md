# WP1 实现与自测报告

日期：2026-11-01。分支：`question-bank-0.4`；基线：`985e11b`。

WP1 代码与自测已完成，交负责人审阅；本报告不代表负责人验收或 38 题内容审阅已经通过。未执行 commit、切换分支或 push；未联网、未增加依赖、未调用模型。全部数据库验证仅使用内存库和临时目录，未打开或修改 `data/app.db` 及其他真实数据库。开工时已有的未跟踪目录 `docs/plans/tasks/` 未改动。

## 改动文件

| 文件 | 改动 |
|---|---|
| `lib/db/schema.ts` | 新增 `questions`、`question_aliases`、`question_alias_candidates`。题目复合主键；当前 ID、当前顺序部分唯一索引；别名状态/家族约束与候选复合外键。 |
| `drizzle/0001_kind_rafael_vega.sql` | 由 `npm run db:generate` 生成的追加迁移，仅建三张新表及索引。 |
| `drizzle/meta/0001_snapshot.json`、`drizzle/meta/_journal.json` | 生成的快照及追加迁移登记。 |
| `lib/db/import-questions.ts` | 注入 SQLite 连接的导入服务；Zod 校验、一一对应检查、不可变内容比较、版本切换、别名与候选写入全部在一次 `BEGIN IMMEDIATE` 事务内。 |
| `scripts/import-questions.ts` | 读取目录/要求文件，使用 `DATABASE_PATH`，失败退出码为 1；不自动迁移、不写来源文件。支持两个可选文件路径参数。 |
| `package.json` | 新增 `db:import-questions`，使用 `node --import tsx`；依赖不变。 |
| `lib/question-bank/types.ts` | 目录、每题要求、别名 Zod schemas 与类型。 |
| `lib/question-bank/aliases.ts` | 负责人在 12 §2.3 确认的 7 条别名，版本 `legacy-20261101-v1`；2 条 matched 到 `qfamily_remote_work`，5 条 not_in_catalog。 |
| `lib/rules/resolve-question.ts` | 纯函数 `normalizeQuestionAlias` / `resolveQuestion`；显式传入目录和别名版本/记录，四种解析结果，无近似匹配。 |
| `lib/rules/unicode-case-fold.ts` | 本机 Python Unicode 15.1.0 离线导出的完整大小写折叠例外表，补足 JavaScript 普通小写转换，例如 ß→ss、ς→σ；无运行时 Python 依赖。 |
| `data/question-bank/requirements.mock.json` | 新增 38 条要求，64 个逐题编写的子要求；英文逐字摘自对应题干，中文说明对象和作答范围；无答案、论点或通用反方模板。 |
| `lib/taxonomy.ts` | 注册 T01–T09、L01–L11、B01–B02，版本 `20261101-v1`；含维度默认重点、自述映射。未把自由字符串诊断输出接入分类表。 |
| `tests/question-bank.test.ts` | 10 项离线测试，覆盖下面的全部题库验收要求。 |
| `scripts/test-db.ts` | 增加真正空库全量迁移、已经执行 0000 且有用户/认证/会话的数据库升级；保留原隔离、级联、迟到模型保存测试。 |
| `README.md` | 增补导入命令、先迁移后导入、临时库自测及内容审阅要求。 |
| `docs/plans/reports/WP1.md` | 本报告。 |

已阅读根 `AGENTS.md`、方案 v4、RFC、12 §2、90 分类表及 §4.1、99 指定条目、冻结题库全部文件和现有数据库/脚本。Next.js 本地指南阅读了 `01-app/02-guides/environment-variables.md` 与 `server-and-client-boundary.md`；本次未修改路由、页面、评分或诊断输入。

## 实现细节与边界

- `questions` 以 `(id, version)` 为主键；两个唯一索引都只约束 `is_current = 1`。切换时先撤销本批受影响 ID 的当前标记，再激活新版本，允许新版本交换题库顺序；历史版本保留。
- 同版本比较题干、家族、主/次主题、题型、池、顺序、来源和完整 `requirements_json`。JSON 对象键顺序不影响比较，数组顺序和字符串内容仍参与比较。内容不同直接抛错，不能覆盖。`bank_version` 的暂定含义及不参与内容冲突比较的原因见“疑问”。
- 同一 ID 跨版本不允许换家族；旧版本重导不会把当前版本降级。未在本批输入的 ID 暂不退休或删除，见“疑问”。
- 要求记录必须与输入目录按 ID/version 一一对应；遗漏、多余、重复、不匹配版本、空子要求、重复子要求 key 都拒绝。目录 ID、顺序也检查唯一性。
- 别名文本先 NFKC、完整大小写折叠、合并/去除首尾空白；保留标点，不把弯引号与直引号额外合并，不删词、不算相似度。`legacy_id` 也走相同规范化。相同版本的别名状态、候选和审阅记录不可悄悄覆盖。
- 导入器保证只有 ambiguous 别名可以有候选，并至少有两个不重复的已知家族；matched 家族也必须存在。数据库外键保证候选有对应别名。数据库没有额外触发器来验证“候选父别名必须为 ambiguous”，该跨表语义由事务导入入口校验。
- 解析器接受调用方提供的目录与别名记录，不读数据库、不读时间；WP2 调用方仍需加载对应版本的记录及候选。数据库导入以首版 7 条为默认值，测试通过显式传入的审阅记录覆盖 ambiguous 情况，没有虚构首版歧义题。
- `taxonomy.ts` 只登记规范，未启用重点推荐，也未修改评分输入。L 类的写前/写中主动字段为 null；B 类不关联评分维度，规范没有给出的达成标准为 null，未自创规则。

## 验收测试对应

以下命名均为 `tests/question-bank.test.ts` 中的完整 `node --test` 名称，除第 7 条外均随 `npm test` 执行。

| 验收 | 对应测试 | 结果 |
|---|---|---|
| 1. 重复导入幂等 | `catalog import is idempotent and installs precisely the seven confirmed legacy aliases`；比较三张表完整快照，并读取落库别名逐条解析 | 通过；第二次 0 题/0 别名新增 |
| 2. v2 保留 v1 并切换当前版本 | `v2 retains frozen v1, switches current version, and an old catalog replay cannot downgrade it` | 通过；39 条历史版本记录、v1 非当前、v2 当前；重放 v1 不降级 |
| 3. 缺少要求时失败且整体回滚 | `missing requirements rejects the entire import on empty and populated databases` | 通过；空库三表仍为空，已有库所有记录不变 |
| 4. 同版本内容变化拒绝（含仅 requirements 变化） | `same id/version rejects every frozen field change, including requirements alone` | 通过；覆盖题干、标签、池、家族、题型、顺序、来源以及要求文本/layout/总判断标记 |
| 5. matched / not_in_catalog / ambiguous / 未登记 | `resolver returns matched, not_in_catalog, ambiguous and unmatched without fuzzy matching`；`ambiguous candidates persist, are versioned and immutable, and reject invalid states` | 通过；也覆盖首版别名落库解析、候选落库、修订版本隔离和非法状态 |
| 6. NFKC（全角/半角、空白等） | `alias normalization: NFKC, full case folding, whitespace; preserve punctuation and non-equivalent letters` | 通过；含全角字母、全角空格、NBSP、换行、大小写折叠、组合字符与不应合并的字符 |
| 7. 空库迁移与已有库升级 | `scripts/test-db.ts` 中 `empty database full migrations and migration replay`、`existing baseline database upgrades, preserving users, auth and session JSON byte-for-byte` 两组断言 | 通过；空库不调用 initialize；升级库先执行仅含 0000 的临时迁移目录，再插入旧数据，最后执行完整迁移 |

额外验证：

- `late question conflict rolls back earlier inserts; late alias conflict rolls back version switches and alias writes`：先真实插入新题版本，再于后面的题目/别名冲突失败；版本、当前标记、别名与候选三表快照全部还原，不仅仅测试写入前校验失败。
- `requirements must match catalog one-to-one and have unique nonempty subquestions`：多余/重复/错版本要求、目录重复 ID/顺序均失败；逐项确认 64 条英文是相应原题的精确摘录。
- `partial unique indexes allow historical orders but reject duplicate current IDs and orders`：数据库直接拒绝重复当前 ID/顺序及非法当前标记；合法历史版本和新版顺序交换成功。

## 命令结果

执行环境：Node `v25.8.2`、npm `11.11.1`。项目 engines 声明 Node 24.x；本次使用工作环境已有 Node，没有安装或切换运行时。

| 命令 | 最终结果与摘要 |
|---|---|
| `npm run db:generate` | 退出 0；识别 7 表，生成 `0001_kind_rafael_vega.sql` 与元数据，没有重写 0000。 |
| `npm run lint` | 退出 0；零 warning。 |
| `npm run typecheck` | 退出 0；路由类型生成、`tsc --noEmit` 通过。 |
| `npm test` | 退出 0；27/27 通过（原 17 项 + WP1 10 项）。 |
| `npm run test:ui` | 退出 0；5/5 通过。 |
| `npm run test:db` | 退出 0；空库迁移、已有库升级及原有隔离/级联/迟到写入/外键回归均通过。 |
| `DATABASE_PATH=/private/tmp/opc-wp1-cli-UIj7sf/questions.db npm run db:import-questions` | 退出 0；`{"bankVersion":"mock-20261101-v1","questions":38,"inserted":38,"aliasesInserted":7}`。 |
| 相同临时路径再次运行 `npm run db:import-questions` | 退出 0；`{"bankVersion":"mock-20261101-v1","questions":38,"inserted":0,"aliasesInserted":0}`。 |
| `git diff --check` | 退出 0。 |
| 冻结文件逐字节对比 `git show HEAD:<path>` | 通过；`data/question-bank/` 原有 10 文件、`initialize.ts`、0000 SQL/快照、`package-lock.json` 完全相同。未运行会写回冻结报告的 `validate_bank.py` / `build_bank.py`。 |

开发过程中第一次新增测试发现 INSERT 漏掉 `bank_version` 的绑定值，已修正并通过所有测试；第一次 typecheck 发现两处测试中 SQLite `get()` 返回值缺少类型约束，已改为完整记录断言后复跑通过。以上表格均为最终结果。

临时 CLI 库的迁移准备遇到一个环境限制：

- `DATABASE_PATH=... npm run db:migrate` 首次退出 1：现有 `db:init` 用 `tsx` CLI，沙箱拒绝其本地 IPC 管道 `listen EPERM .../tsx-501/...pipe`；不是迁移 SQL 失败。
- 没有请求扩大权限或改动现有脚本。依次运行 `DATABASE_PATH=... node --import tsx scripts/db-init.ts` 和 `DATABASE_PATH=... node node_modules/drizzle-kit/bin.cjs migrate`，均退出 0，然后执行上表的导入。
- `db:import-questions` 本身使用 `node --import tsx`，运行成功。此次未运行 build；WP1 指定的五项检查均已执行。

## 疑问（待负责人决定）

以下是尚未有明确产品契约的边界；暂行处理仅为了使 WP1 可测试，不应视为已经确定的发布行为。

| 问题 | 候选方案 | 暂时采用的最保守做法 |
|---|---|---|
| 目录发布版本升级时，未改内容的题目版本也会出现在新 `bankVersion` 中。行的 `bank_version` 应表示首次收录还是最新目录成员身份？ | A. 保留首次收录版本；B. 覆盖为最新发布版本；C. 所有题都升题目版本；D. 将目录成员版本单独建表 | 暂用 A：重用同一题目版本时不覆盖旧行 `bank_version`，也不把目录发布号变化当作题目内容冲突；其余所有内容严格比较。测试用完整目录发布 v2、仅一题升级覆盖这一点。若后续需要完整历史目录成员关系，应先明确新契约。 |
| 导入的目录缺少数据库已有 ID，是否表示该题下架？ | A. 只处理输入 ID；B. 将缺失题设为非当前；C. 拒绝非完整目录 | 暂用 A，保留已有题及当前状态，避免无明确指令时让题目消失；没有实现下架功能。要求文件仍必须与本次输入目录一一对应。 |
| 旧目录重放是否应回退当前版本？ | A. 保留最高版本；B. 按最后导入切回；C. 拒绝旧版本导入 | 暂用 A，既保留幂等性又不让旧目录恢复过时题目；不提供隐式降级。 |
| 旧 ID 别名与精确文字证据冲突时如何定优先级？ | A. 旧 ID 优先；B. 文字优先；C. 保持未解析，交人工复核 | 暂用 C，返回 `ambiguous` 并列出已知候选家族；若冲突为 not_in_catalog 对一个精确家族，候选可能只有一个，但结果仍未解析。正常首版七题不触发此情况。未来调用方须按 result 判断，不能以候选数量推断 resolved。 |
| `requiresOverallJudgement` 是只指 outweigh，还是涵盖立场、双方讨论结论、正负评价、最有效与相对重要性？ | A. 只标 outweigh；B. 标记原题明确要求判断的所有情形 | 暂用 B 的内容标记，按原题要求而不是题型推导；纯原因/影响或一般措施题为 false。此标记尚未接入模型检查，负责人应在内容审阅时确认。 |

版本字符串 `legacy-20261101-v1`、`20261101-v1` 与要求文件顶层数组属于本次实现格式约定；没有新增产品功能开关或启用任何功能。

## requirements.mock.json 中拿不准的题

全部 38 题仍需负责人逐题审阅。下面列出需要特别确认的解释，而非只凭题型机械填表；暂未导入任何非测试数据库。

| 题目 | 拿不准的理由 | 暂行拆法与待确认点 |
|---|---|---|
| `qb_mock_health_001` | 第二问为 “the most effective way”，不是一般的措施罗列；总判断标记是否涵盖“最有效”没有明确定义 | 拆成 `reasons` 与 `most_effective_prevention`；标 true，要求指出认为最有效的方式及理由，但未规定必须列几个对比方案。请确认标记语义。 |
| `qb_mock_soc_008` | “Do you think one factor is more important than others?” 允许否定，不等于必须选一个最重要指标 | 拆成其他指标、相对重要性判断；标 true，明确允许“没有单一因素最重要”。不强迫选经济指标或非经济指标为第一。 |
| `qb_mock_tech_005` | “agree or disagree” 指向前述电脑更聪明及“消极发展”复合句，可能被读成还要单独判断电脑是否真的更聪明 | 暂按原目录 `agree_disagree` 与本地中文来源理解，要求评价这一发展是否消极；不额外增加事实预测子问，也不改冻结题干。 |
| `qb_mock_culture_002` | “responsible tourist” 同时关联文化和环境；是否必须为两方面各设独立卡片槽位未规定 | 保留一个立场子问，在中文说明中保留两方面范围；不凭该并列词新增两个独立论点或固定段落。 |
| `qb_mock_health_004` | 第二问同时问本人和周围人，可以拆为两个检查项，也可以保留一个完整原问 | 保留原题的两个问句，第二问中文明确两个对象都要回应；没有新增解决措施要求。 |
| `qb_mock_tech_004` | 社交媒体用途列出保持联系与获取新闻；是否必须分别展开成两套利弊未规定 | 保留一个完整 outweigh 问句，中文要求结合两种用途；不要求两套独立利弊段落。 |

审阅定位摘要：`requirements.mock.json` 共 38 条、64 个子要求；SHA-256 为 `43fb2323304a451dfeb211c8e2d5241f02f3ce28aaa8c11c978895482ae02d0c`。讨论双方题分别记录双方观点原文及个人意见指令；outweigh 题保留完整比较问句，中文明确双方与权衡；原因/措施、问题/措施和原因/影响分别按实际原问写出。

## 未完成事项

- 无遗漏的 WP1 编码或指定自动化验收测试。
- 待负责人逐题审阅 `requirements.mock.json`、回答上述疑问并验收。临时库导入仅用于本次自测，正式内容审阅仍未完成。
- 未做真实数据库导入、生产发布、UI 接线、迁移扫描、会话快照、重点推荐或 WP2 之后的工作。`99_实现清单.md` 未打勾、未补提交号，由负责人验收后处理。
- Node 24.x 上未另跑一轮（环境提供 Node 25.8.2）；如负责人验收使用项目声明的 Node 24，应按相同五项命令复跑。

## 负责人验收（2026-11-01，Claude Code）

**结论：修改后通过。**

1. 阅读全部改动并对照 RFC §2/§3、12 §2、99 QB-01/02/03/09 与方案第 3 节约定：表结构、部分唯一索引、同版本冻结比较（含 `requirements_json`）、整次事务回滚、追加迁移、`initialize.ts` 未动、无新依赖、冻结文件未改，均符合。
2. 重跑 `lint`、`typecheck`、`npm test`（27/27）、`test:ui`（5/5）、`test:db`（3 组 PASS）；临时库首次导入 38 题 / 7 别名，重复导入 0 / 0。
3. 别名逐条核对 `lib/pipeline/initial.ts` 与 `components/shell/new-essay.tsx` 原文：7 条一致；`technology` 与“工作与社会”指向 `qfamily_remote_work`（`qb_mock_work_002` 的家族）。
4. `requirements.mock.json` 38 题逐题审阅：拆分按题干实际问句，英文为原文摘录，中文说明准确且不含答案；6 道“拿不准”的题均采用实现者的暂行拆法。**审阅通过，可以导入。**

**负责人直接修改（小改动，不退回）：**

- 删除 `lib/rules/unicode-case-fold.ts`（300 行 Unicode 大小写折叠例外表）。本应用的题目只有英文和中文，`toLowerCase()` 的结果与完整折叠一致；`normalizeQuestionAlias` 改为 NFKC + `toLowerCase()` + 合并空白，测试同步调整。12 §2.3 的措辞改为“转小写”。

**疑问的决定（已写入 12 §2.2、§2.4）：**

| 问题 | 决定 |
|---|---|
| `bank_version` 的含义 | A：首次收录的目录版本，不参与内容比较 |
| 导入缺少已有 ID | A：只处理输入 ID，不下架 |
| 旧目录重放 | A：保留最高版本 |
| 旧 ID 与文字证据冲突 | C：`ambiguous` |
| `requiresOverallJudgement` 语义 | B：题目要求作者给出立场、评价、权衡或优先判断时为 true，按题干判断 |

未在 Node 24.x 上另跑；本机为 Node 25.8.2，留待 WP8 上线检查时在声明版本上复跑。
