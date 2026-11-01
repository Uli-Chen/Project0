# WP3 模型调用：预留、限额与日志（QB-10）

完成日期：2026-11-01。分支 `question-bank-0.4`；未提交、未切分支、未 push。

已实现 WP3 全部范围，供负责人验收。五项规定检查、31 项新增专项测试与临时 SQLite 端到端脚本通过。没有联网、安装依赖或调用真实模型，没有打开或修改 `data/app.db`、`.claude/`、冻结题库；现有 `lib/pipeline/engine.ts` 的所有精练调用保持不变。原先已有的未跟踪文件 `docs/plans/tasks/WP3_prompt.md` 未修改。

## 最终接口签名

### 配置与完整消息

位置：`lib/llm/budget.ts`、`lib/llm/messages.ts`（消息函数也从 `lib/llm/client.ts` 导出）。

```ts
type BudgetLimits = {
  calls: number; inputTokens: number; outputTokens: number; waitMs: number;
};
type QuickPurpose = "quick_followup" | "quick_check";
type ModelMessage = { role: "system" | "user"; content: string };
buildMessages<T>(instruction: string, context: unknown,
  schema: z.ZodType<T>, attempt?: number): ModelMessage[];
estimateInputTokens(messages: readonly ModelMessage[]): number;
```

- `attempt` 从 0 开始；大于 0 时加入原客户端的重试提示。包含系统指令、完整 Schema、用户 JSON 与重试提示，不截断任何内容。
- 估算为 `Buffer.byteLength(JSON.stringify(messages), "utf8") + 256 + 32 * messages.length`。按每字节一个 token 计，加固定协议与逐消息余量，是**保守准入估算**，不是 provider 实测用量；对通常的 byte tokenizer 与中英文偏高估，不声称是任意未来 tokenizer 的数学上界。
- `budgetConfigVersion = quick-budget-20261101-v1`，`promptConfigVersion = coach-json-v1`，`inputEstimateVersion = utf8-byte-v1`。`callConfigVersion` 拼接这三个版本，写入 `config_version`，因此没有再加重复的 `prompt_config_version` 列。更改消息协议、提示策略或预算时须更新对应版本。
- `quickBudget` 包含初始包（2 追问、2 检查、1 共享重试，5 / 20,000 / 3,328 / 100,000ms）、补充包（0 追问、1 检查、1 重试，2 / 8,000 / 1,536 / 50,000ms，间隔 86,400,000ms）、单次（输入 4,000，追问输出 512、检查输出 768，25,000ms）及用户滚动窗口（86,400,000ms，15 / 60,000 / 12,000 / 300,000ms）。

### 预留、核销、恢复

位置：`lib/llm/calls.ts`。下述 `sqlite?` 是可选的 `better-sqlite3.Database`，默认 `getDb().$client`；支持 WP4 在同一连接、外层 IMMEDIATE 事务内同时写逻辑操作与冻结输入。

```ts
type ReserveCallInput = {
  userId: string; operationId: string; packageId: string;
  purpose: QuickPurpose; sessionId: string | null;
  perCall: { inputTokens: number; maxOutputTokens: number };
  packageLimits: BudgetLimits;
  now: string; // 服务端传入 UTC ISO；不在规则内读取时钟
};
type Reservation = Readonly<{
  id: string; userId: string; sessionId: string | null;
  operationId: string; packageId: string; purpose: QuickPurpose;
  attempt: number; model: string; configVersion: string; startedAt: string;
  reservedInput: number; reservedOutput: number; reservedMs: number;
}>;
type ReserveCallResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: "user_quota" | "package_quota" | "input_too_long";
      retryAt: string | null };
reserveCall(input: ReserveCallInput, sqlite?): ReserveCallResult;

type CallUsage = { inputTokens: number | null; outputTokens: number | null };
type CallSettlement = {
  usage: CallUsage | null;
  latencyMs: number;
  outcome: "ok" | "timeout" | "invalid_output" | "provider_error" | "indeterminate";
};
settleCall(reservation: CallRecord, result: CallSettlement, sqlite?): void;
recoverInflightCalls(now: string, sqlite?): number; // 改为 indeterminate 的行数
```

`CallRecord` 是 `Reservation` 的通用日志形状：`packageId`、`operationId` 可为 null，`purpose` 支持 90 §6.3 的有效用途。`settleCall` 同时接受普通观测日志记录与速刷 Reservation。

- `perCall.inputTokens` 是本次完整消息估算；`maxOutputTokens` 是调用方采用的单次上限（不能超过该用途的 512 / 768）。使用正整数输出上限，其他额度为非负整数；元数据 ID 为 1～128 个字母、数字、`_ . : -`，用途为枚举，不能传正文或错误原文。
- 预留在 `IMMEDIATE` 事务内读取用户及包占用、判断四项额度、按 `(userId, operationId)` 分配 1 起算的 `attempt`、插入一行。数据库错误直接抛出；拒绝不插行。`packageLimits` 必须来自服务端包记录，不能信任请求体。
- WP4 外层也必须用 `.immediate()`；内层是同连接 savepoint。必须等外层成功提交后再调模型，不能在事务中 `await generateJson`。派发前检查数据库行，回滚掉的预留无法调用。
- `Reservation` 是当前进程发行的一次性对象，应原样交给 `generateJson`，不能复制、序列化后重建或重复派发。恢复不会重建令牌或重发；重试必须重新 `reserveCall`，逻辑 `operationId` 不变。
- 用户额度只统计 `package_id IS NOT NULL`，窗口为 `(now - 24h, now]`；包额度统计同一用户同一包的全部历史，与会话存在与否无关。
- `reserved`、`indeterminate` 的三项容量全按预留；其他结果 token 按实际，单项未知则回退到相应预留。正常结束按实际耗时；timeout 按 `max(实际耗时, reserved_ms)`，满足超时仍计预留时间的验收要求。调用次数不退还。
- `retryAt` 在用户额度拒绝时为窗口内最早一行的 `started_at + 24h`，表示最早有容量滚出的重检时刻，**不保证到时所有维度都足够**；需重新预留。输入超长与包额度拒绝返回 null，见“疑问”。同时不足时优先返回用户额度原因。
- 核销是单条原子 UPDATE，只更新 `outcome = reserved`；写库失败只输出固定日志，不传播到业务层，不输出 SQL／provider 错误对象。行保持完整预留。重复核销、恢复后的晚到结果不改变已结束／不确定记录。
- `recoverInflightCalls(now)` 把所有 `reserved` 改为 `indeterminate`，不改开始时间、预留或未知用量，不把停机时间伪装为模型耗时；返回更改行数，重复调用返回 0。`instrumentation.ts` 的 Node 启动入口调用它，独立 catch，失败不阻止既有迁移扫描或服务启动。

### 模型调用

```ts
type GenerateJsonOptions = {
  purpose: LlmPurpose;
  userId?: string; sessionId?: string | null; operationId?: string;
  reservation?: Reservation;
  maxInputTokens?: number; maxOutputTokens?: number; timeoutMs?: number;
  retries?: number; // 额外尝试数，默认 1；仅格式/不完整输出重试
};
generateJson<T>(instruction: string, context: unknown,
  schema: z.ZodType<T>, options?: GenerateJsonOptions): Promise<T>;
```

- 不传 options：保持原有 16,000 输出、约 120 秒逻辑调用期限、最多两次尝试及重试条件／错误提示；不打开日志数据库、不写 `llm_calls`。
- 有 reservation：每次仅一次 provider 尝试；预留输出／等待额度优先于 options 的覆盖值；完整消息再次估算，不能超过预留输入。用途、用户、操作、会话、模型、持久化容量须匹配。返回或抛出模型错误前执行核销。
- 显式技术重试使用同一 operationId 新预留，`attempt > 1` 时发送重试提示。预留之前就必须把提示算入估算：首试 `buildMessages(..., 0)`，重试 `buildMessages(..., 1)` 即可（所有正数的提示相同）。
- 有 userId 无 reservation：每次 provider 尝试独立写观测日志，`package_id = null`；插入或核销失败均不影响调用。无 userId 无 reservation 不写日志。
- provider usage 映射 `prompt_tokens` / `completion_tokens`；未知项 NULL，已知真实 0 保留 0。成功 `ok`，不合格 JSON／Schema／finish reason 为 `invalid_output`，HTTP 错误 `provider_error`；本地期限触发为 `timeout`，连接／响应体丢失为 `indeterminate`。上游中断说“aborted”而本地时限未到仍为 `indeterminate`。
- 预留后的派发前校验失败保留预留，不擅自退额度；正常调用方先构建完整消息、正确预留即可避免。进程下次启动会保守恢复该行。

WP4 接入顺序：构建完整消息并估算 → 外层 IMMEDIATE 写操作／冻结输入／调用 reserveCall → 提交成功 → 事务外 generateJson（原样传 reservation）→ 新短事务提交卡片结果。每次 provider 重试重新预留；共享重试、轮次／版本幂等、补充包发放／关闭与冻结输入归 WP4 管理。

## 表与改动文件

`llm_calls` 采用显式 `reserved` 进行中状态，17 列与 90 §4.1 对齐；唯一外键 `user_id → users ON DELETE CASCADE`，`session_id`、`package_id`、`operation_id` 无外键。用户时间窗、用户包、用户操作有索引；结果枚举与非负用量有数据库 CHECK。没有提示词、上下文、输出、provider 错误正文或原始响应列。

| 文件 | 改动 |
|---|---|
| `lib/db/schema.ts` | llm_calls 表、索引、约束 |
| `drizzle/0003_absent_stellaris.sql`、`drizzle/meta/0003_snapshot.json`、`drizzle/meta/_journal.json` | `npm run db:generate` 生成的追加迁移；未改基线 initialize |
| `lib/llm/budget.ts` | 完整限额、用途、三种配置版本 |
| `lib/llm/messages.ts` | 抽出的完整消息与保守估算 |
| `lib/rules/llm-budget.ts` | 纯函数 occupiedBudget / decideReservation，时间由 now 输入 |
| `lib/llm/calls.ts` | 预留、观测、核销、恢复及一次性派发校验 |
| `lib/llm/client.ts` | 可选 options、逐次日志、分类、核销，保留无 options 行为 |
| `instrumentation.ts` | Node 启动恢复，失败只记录日志 |
| `tests/llm-budget.test.ts`、`tests/llm-calls.test.ts` | 31 项新增测试 |
| `tests/helpers/llm-reserve-worker.ts` | 两进程竞争的独立连接 worker |
| `scripts/test-db.ts` | 空库、WP2c 升级、练习删除保留日志、账户级联 |
| `scripts/test-llm-e2e.ts` | 临时库进程内端到端脚本，含实际 instrumentation 入口 |
| `docs/plans/reports/WP3.md`、`WP3_e2e/*` | 本报告与证据 |

## 验收用例对应

下表均通过。专项名称与完整输出见 [targeted-tests.log](WP3_e2e/targeted-tests.log)。

| # | 验收情境 | 测试与证据 |
|---|---|---|
| 1 | 成功、实际用量、按实际额度 | `成功：完整消息与估算一致，一行 ok 记录实际用量，额度按实际计`；E2E reserved/settled 快照 |
| 2 | 延迟假 fetch、可控时钟超时 | `超时：延迟假 fetch 与可控时钟触发 timeout，预留时间仍占额度`；mock Date/setTimeout/AbortSignal，推进 1700ms |
| 3 | 不合格输出不自动重试 | `不合格输出：带预留即使 retries=9 也不自动重试；显式重试重新预留并计 attempt` |
| 4 | usage 未知不是 0 | `usage 未知或仅单项已知：NULL 不伪造 0，未知项按预留计`；纯函数核销测试 |
| 5 | 核销写库失败 | `核销写库失败：业务仍得到模型结果，原子更新不泄漏实际用量，预留完整保留`；真实 SQLite 触发器中断 UPDATE，前后行全等 |
| 6 | 响应丢失／恢复 | `响应丢失：连接或响应体中断为 indeterminate，绝不自动重发`、`启动恢复：reserved 变 indeterminate，用量和预留不变，晚到结果不能释放额度`、AbortError 中断测试；E2E 实际 register 的失败／恢复路径 |
| 7 | 预留写入失败不调用 | `预留写库失败抛错且 fake fetch 从未调用；外层 IMMEDIATE 回滚也不能 dispatch`；真实触发器与事务回滚 |
| 8 | 两进程两个连接并发 | `并发：真实 SQLite 两进程两连接，两张卡片争抢用户最后一次额度只有一个成功`；14 条已用、两个 IPC ready 后同时放行，最终恰 15 行，另一方 user_quota |
| 9 | 包／用户四项独立、24h、新练习不重置 | `包 {calls,inputTokens,outputTokens,waitMs} 上限独立生效` 与对应四个用户测试；窗口边界、最小等待、换操作／练习实际库测试；另外验证用户隔离 |
| 10 | 输入超长 | `输入超长不建行不调模型；预留后的完整消息若超估算也拒绝`；4,000 / 4,001 边界纯函数测试 |
| 11 | 所有列均无正文 | `日志全表任何列均不含独特提示词、上下文、模型输出正文`，全表序列化扫描；E2E 同样扫描 |
| 12 | 无 options 兼容 | `无 options 保持 16000 输出、120 秒、两次尝试且不写日志`；全部原有测试含 agent / learning-flow 通过且未修改 |
| 13 | db 空库、旧库、删除 | `scripts/test-db.ts` 空库全迁移与重复迁移，baseline → WP1 → WP2c → WP3 的数据保留，删除练习七张元数据表仍在且仅 users 级联，删除用户全部为空 |

补充验证：普通观测逐次日志、观测插入故障不影响业务、HTTP 错误分类与正文排除、复制／重复／跨用户／事务内派发被阻止、非预留 options 生效而预留额度不可被覆盖、配置数字完整性。

## 端到端证据与命令结果

E2E 运行 `LLM_API_KEY='' node --conditions=react-server --import tsx scripts/test-llm-e2e.ts`。临时库全量迁移，真实写入会话与预留，一次假 fetch 后核销；制造启动 UPDATE 故障验证容错，随后实际调用 instrumentation 恢复，再走实际 deleteSession 与 users 级联。末尾 `integrity_check=ok`，目录自动清理。

- [e2e.log](WP3_e2e/e2e.log)：四段验证结果。
- [ledger-evidence.json](WP3_e2e/ledger-evidence.json)：预留、核销、恢复、删除前后完整日志行与汇总；无正文。
- [targeted-tests.log](WP3_e2e/targeted-tests.log)：31 / 31，含跨进程并发结果断言。

所有启动命令均显式 `LLM_API_KEY=''`；测试在覆盖全局 fetch 后／隔离测试初始化中使用假凭证，worker 的启动环境同样为空。检查命令额外指定临时 DATABASE_PATH；数据库测试均另建专用临时库。没有执行 db:migrate 或打开应用库。实际可用运行时是 Node v25.8.2（仓库 engines 标注 24.x），结果如实基于该环境。

| 命令 | 最终结果 | 日志 |
|---|---|---|
| `npm run db:generate` | exit 0；生成 0003，14 张表中新增 llm_calls | 生成 SQL／snapshot |
| `npm run lint` | exit 0，零 warning | [lint](WP3_e2e/check-lint.log) |
| `npm run typecheck` | exit 0，Next typegen 与 tsc 通过 | [typecheck](WP3_e2e/check-typecheck.log) |
| `npm test` | exit 0，114 / 114 | [test](WP3_e2e/check-test.log) |
| `npm run test:ui` | exit 0，19 / 19 | [test:ui](WP3_e2e/check-test-ui.log) |
| `npm run test:db` | exit 0，四段数据库检查通过 | [test:db](WP3_e2e/check-test-db.log) |

初次开发检查发现测试中的 assert 类型收窄导致 TypeScript 报错，以及独立 E2E 脚本顶层 await 不适用于本仓库 CJS 输出；分别修正测试分支与 async main 后重跑。上表及日志是最终版本结果。

## 原有测试调整及原因

既有 `tests/` 测试未修改。`scripts/test-db.ts` 增加 WP3 验收所需的日志表、WP2c 迁移中间态及保留／级联断言，原有断言保留；保留表数量由六改为七。没有放宽既有断言或修改精练调用点来适配新实现。

## 未完成事项

WP3 范围无未完成项。`quick_packages` 发放／关闭、补充包资格、共享重试与逻辑操作幂等、冻结输入及卡片提交归 WP4a/4b；本包只按传入包 ID 与服务端限额汇总。方案风险表 D-08 的 512/768 推理输出充足性仍须在 WP4 后实测，由负责人／创始人决定是否调整；本次遵守不调用真实模型的要求，没有把假 fetch 当作模型质量验证。

## 疑问

1. **“最早可再申请时间”的含义**：候选方案是“任意容量首次滚出时刻”或“根据当前请求重算所有维度均足够的时刻”。负责人指定最早一条滚出，因此实现前者；WP4 展示为可重检时间并重新预留，不承诺届时一定成功。包额度没有自动滚动，补充包资格又需 WP4 的 grantedAt／卡片状态，不能从本表推断；最保守返回 `retryAt: null`，由 WP4 合并补充包资格时间。输入超长同样为 null，不能用等待解决。
2. **90 §6.3 模型名称与现有配置不一致**：候选方案是切换文档中的默认模型，或保留现有配置。按本包“不改精练”的边界保留 `LLM_MODEL`／现有 `deepseek-flash` 默认，预留记录实际配置并派发前核对；没有擅自换模型。未来 WP4 调整提示策略须同步更新 promptConfigVersion。
3. **预留后、真正派发前失败是否退额度**：可新增明确的“未派发取消”结果并释放，或维持保守预留。本包结果枚举没有取消状态，且 RFC 要求不把中断视为零消耗，暂时保留预留并由启动恢复标记 indeterminate；不新增产品退款规则。正常路径通过先估算完整消息、短事务立即提交、随后调用来避免此情况。

## 负责人验收（2026-11-01，Claude Code）

**结论：通过。**

1. 代码审阅：预留在 `IMMEDIATE` 事务内按用户滚动窗口与包累计判断并插行，拒绝不插行；每个预留对象只能派发一次，且派发前校验数据库行未被核销 / 恢复、不在事务内；带预留只做一次尝试；核销失败只记日志并保留预留；用量未知与超时按预留值（超时取预留与实际较大者）占额度；启动恢复只改状态、不编造用量。不传 options 时超时、输出上限、重试次数与错误文字均与原实现一致，精练调用点未改。
2. 疑问的决定：`retryAt` 取用户窗口最早一条滚出时间、包额度与输入超长返回 `null`，由 WP4 合并补充包资格时间（同意）；模型名沿用现有 `LLM_MODEL` 配置，不按 90 §6.3 改动（同意，90 §6.3 已注明实际实现用 OpenAI 兼容接口）；预留后派发前失败不退额度（同意，保守）。
3. 非阻塞备注（WP4b 顺带处理）：`reserveCall` 中模型名用 `process.env.LLM_MODEL ?? "deepseek-flash"` 重复了 `getLlmConfig()` 的默认值逻辑；派发前的一致性校验会拦住不一致，但应改为复用同一配置读取。
4. 测试证据（由实现者完成）：五项检查 114/114、19/19、4 组 PASS，负责人重跑确认；跨进程并发预留只有一个成功、另一个 `user_quota`；端到端临时库验证预留 → 核销 → 启动恢复（含恢复失败容错）→ 删除练习保留日志 → 账户删除清空；日志行无正文。
