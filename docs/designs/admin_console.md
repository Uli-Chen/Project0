# 管理后台（Admin Console）

- **Author:** uli-chen（产品方向）；由 Claude Code 根据代码现状整理。
- **Created:** 2026-11-04。
- **Status:** 设计草案 v1。尚未实现。原型见 [mockups/admin-v1.html](mockups/admin-v1.html)（静态页面，示例数据）。
- **相关：** [tutor_style_tiers.md](tutor_style_tiers.md) §4 调用记录、§7 模型档位、§8 批改配置；[成本备忘录](../../成本备忘录.md)；[商业计划备忘录](../../商业计划备忘录.md) §9 合规。

## 1. 目标与范围

给一人公司的运营者一个后台，高效、完整地管理：

1. **用户数据**：查找、查看、处置账户，看到每个用户的用量、收入和毛利。
2. **API 服务**：提供商（endpoint、key、健康度）、模型与定价、调用点路由。
3. **收支计算**：模型变动成本、固定支出、收入、毛利、单位经济、对账。

**不在范围内：** 接入支付渠道（等收费主体确定）；多管理员分级权限；在后台编辑提示词；自动降档。

## 2. 已定决定

| # | 决定 | 日期 |
|---|---|---|
| D1 | 后台与主应用同一进程、同一部署，路径 `/admin` 与 `/api/admin`；nginx 按 IP 限制访问，应用内再做管理员校验 | 2026-11-04 |
| D2 | 密钥只存在环境变量文件里，不进 SQLite、不进数据库备份；但后台可以更换 endpoint 和 key（§6.2） | 2026-11-04 |
| D3 | 金额默认同时显示 CNY 和 USD（CNY 为主数字，USD 为副数字）；TWD 只用于记账导出 | 2026-11-04 |

## 3. 已知事实（2026-11-04 代码）

| 现状 | 位置 | 对后台的影响 |
|---|---|---|
| `users` 没有角色、状态、最近活跃时间 | `lib/db/schema.ts` | 加列（§8） |
| 模型服务只有一套：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，每次调用时读取 `process.env` | `lib/llm/config.ts` | 后台改配置需要一个可热加载的环境文件层（§6.2） |
| `llm_calls` 有 token、model、provider、callSite、stageGroup、outcome、latency，没有金额 | `lib/db/schema.ts` | 结算时写入价格与金额（§7） |
| `readUsage` 只读 `prompt_tokens` / `completion_tokens`，未读缓存命中 | `lib/llm/client.ts` | 补读 DeepSeek 的 `prompt_cache_hit_tokens` 等字段，否则成本偏高 |
| 档位对照表（Adept / Mentor / Sage）已设计、未实现，每档带 `apiKeyEnv`；批改配置独立、换模型需校准 | tutor_style_tiers §7.2、§8 | 路由页按"档位 / 批改 / 速刷"三组展示（§6.4） |
| 无套餐、订单、收款记录；收人民币的主体未定 | 商业计划备忘录 §9 | 收入先手工记账 |
| 功能开关、注册开关、速刷限额在环境变量和常量里 | `lib/config/features.ts`、`lib/llm/budget.ts` | 首期只读展示 |
| 完整请求与回复默认不保存（`LLM_PAYLOADS_ENABLED=false`） | `lib/config/features.ts` | 后台默认看不到内容 |
| 生产环境变量在 `/home/squareofchen/opc/.env.local`（600），发布脚本会复制它 | `deploy/README.md`、`deploy/release-*.sh` | 后台写的密钥文件放在发布目录之外（§6.2） |

## 4. 原则

1. **一个人能管过来。** 总览回答三个问题：有没有出事、花了多少钱、谁在用。用户列表直接显示每个人的毛利。
2. **账本不可改。** 价格按生效时间只增不改；每次调用在结算时写入当时的价格和金额，调价不改历史。
3. **默认只看元数据。** 作文、对话、payload 需要"破例查看"：填理由、限时 30 分钟、写审计。
4. **密钥只写不读。** 后台能写入新 key，但任何接口都不返回 key 明文；界面只显示末四位和指纹。

## 5. 信息架构

```
/admin
├─ 总览            KPI、成本趋势、告警、成本前 10 / 亏损用户
├─ 用户            列表 → 详情抽屉
├─ 模型调用        llm_calls 浏览、透视、按操作聚合
├─ API 服务
│   ├─ 提供商      endpoint、key、健康度、余额、更换配置
│   ├─ 模型与定价  按生效时间的价格历史、影响预览
│   └─ 路由        档位 / 批改 / 速刷 → 模型
├─ 财务
│   ├─ 损益        收入、变动成本、固定成本、毛利、净利
│   ├─ 收入        收款流水（手工录入）
│   ├─ 支出        固定支出流水
│   └─ 对账        本地成本 vs 供应商账单
├─ 运营            功能开关、注册开关、限额、题库与别名审核队列（首期只读）
├─ 审计日志
└─ 系统            备份、数据库大小、迁移版本、健康检查
```

全局顶栏：时间范围（今天 / 7 天 / 30 天 / 本月 / 自定义）、⌘K 命令面板（按邮箱或 ID 跳到用户，跳到任一页面）。筛选写进 URL，可保存为常用视图。

## 6. 页面

### 6.1 总览与用户

**总览**
- KPI：模型成本、收入、毛利、活跃用户（日 / 周）、完成练习、每次练习成本（对比 ¥0.50 目标）、失败率、p95 延迟；每项与上一周期对比。
- 成本趋势：按天堆叠，按 `stageGroup`（prewrite / assist / revise / nudge / judge / quick）分色。
- 告警：1 小时内 `provider_error` + `timeout` 占比超过 5%；用户当日额度用到 80%；价格超过 30 天未核实；备份超过 24 小时；本月成本超过预算；提供商余额低于阈值。
- 成本前 10 用户、亏损用户（成本 > 收入）。

**用户列表**：邮箱 / 名称、状态、套餐、注册、最近活跃、30 天练习、30 天成本、累计收入、毛利、失败调用。筛选：状态、套餐、活跃窗口、成本区间、"成本 > 收入"、"注册后未练习"。批量：暂停、恢复、赠送额度、导出 CSV。快捷键 j / k / Enter。

**用户详情抽屉**：

| 标签 | 内容 |
|---|---|
| 概况 | 目标分、考试日期、练习节奏（`profile_json`）、状态、套餐 |
| 练习 | 深度练习、检查点、速刷的元数据：时间、题目、模式、阶段、分数；不显示正文 |
| 用量 | 调用时间线、按用途成本、当日额度使用率 |
| 账务 | 订阅、收款、退款、赠送 |
| 安全 | 活跃会话数、登录失败次数 |
| 审计 | 对该用户的 admin 操作 |

操作：暂停 / 恢复、撤销全部会话、调整额度、记一笔收款或退款、删除账户（重新输入密码 + 输入邮箱确认，复用现有级联删除）、破例查看内容。

**暂停**的效果：撤销会话、拒绝登录，并在模型准入（`admitModelCall`）处拒绝；数据保留。

### 6.2 提供商与密钥（D2）

**列表**：名称、Base URL、接口类型（OpenAI 兼容）、key 状态（已配置 · 末四位 · 更新时间）、地区、本月花费、最近成功调用、1 小时错误率、p95 延迟、余额（供应商有余额接口则自动拉取，否则手工填）。

**密钥存放**

- 新增一个环境文件，路径由 `PROVIDER_ENV_PATH` 指定，生产建议 `/home/squareofchen/opc-secrets/providers.env`：在发布目录之外，所以发布脚本不会覆盖它；`600`，属主为服务用户（服务已是 `UMask=0077`）。
- 格式是普通 `KEY=VALUE`，每个提供商一组：`LLM_PROVIDER_<ID>_BASE_URL`、`LLM_PROVIDER_<ID>_API_KEY`。数据库只存 `<ID>` 和变量名（即档位表里的 `apiKeyEnv`）。
- 读取优先级：`providers.env` > `process.env`（含 `.env.local`）。读取时按文件 mtime 缓存，文件变了就重新解析，**不需要重启**。现有 `LLM_*` 作为默认提供商的兜底，生产环境不改也能跑。
- SQLite 和 `db:backup` 都不含 key。`providers.env` 的备份由运营者另行处理。

**更换 endpoint / key 的流程**

1. 打开"更换配置"，填写新 Base URL 和 / 或新 key。key 输入框只写，不回显旧值。
2. **测试连接**：用候选配置发一次最小请求（同 `llm:ping`），显示状态码、延迟、模型名；测试不写入文件、不计入用户成本，单独记入 `admin_probe` 用途。
3. 测试通过才能保存。保存时要求重新输入管理员密码。
4. 写入：先写临时文件、`fsync`、再 `rename` 原子替换；旧文件保留为 `providers.env.prev`，可一键回滚。写入用进程内互斥锁串行化。
5. 下一次调用起生效；正在进行的调用不受影响。
6. 审计记录：操作者、提供商、改了哪些字段、新 key 的末四位和 SHA-256 前 8 位；**不记录 key 明文**。

**Base URL 校验**：只允许 `https://`；拒绝解析到回环、内网、链路本地地址的主机，防止 SSRF。

### 6.3 模型与定价

- 每个模型一组价格历史：输入、输出、缓存读、缓存写单价（每百万 token），思考 token 计价方式，阶梯规则，币种，来源链接，核实日期，生效起止时间。
- 只能新增价格，不能修改已生效的价格。新增前显示**影响预览**：用新价格重算最近 30 天，给出差额。
- 价格超过 30 天未核实时，总览出现告警。

### 6.4 路由

对齐 tutor_style_tiers §7、§8，分三组：

| 组 | 行 | 可改项 | 切换条件 |
|---|---|---|---|
| 档位 | Adept / Mentor / Sage | 提供商、模型、推理参数、按调用点的输出上限与超时、启用 | 改动生成新的 `tier_table_version` |
| 批改 | evaluate / compare / review / finish / quick.check | 模型、推理参数 | **校准检查通过才能切换**（平均绝对偏移 ≤ 0.25、单篇最大 ≤ 0.5）；未通过时按钮禁用，强制切换需要填理由并在进步曲线上标断点 |
| 速刷 | quick.followup / quick.check | 模型；保持关闭思考 | 同档位 |

每行显示：最近 30 天调用次数、单次练习成本估算、最近一次评测结果（`tutor:verify` / 校准）。

### 6.5 模型调用

- `llm_calls` 大表：按时间、用户、callSite、档位、模型、提供商、outcome、延迟、金额筛选。
- 透视：用途 × 模型 → 次数、token、金额、失败率、p95。
- 单条：预留 vs 实际 token、`finishReason`、`reasoningTokens`、`warnings`、`promptVersion`、`configVersion`；只有 payload 开关打开、未过期并通过破例查看时才显示内容。
- 按 `operationId` / `packageId` / `sessionId` 聚合，看"这一次练习"或"这一个速刷包"的总花费。

### 6.6 财务

- **损益**：收入 − 模型成本 = 毛利；毛利 − 固定支出 = 净利。按月。
- **单位经济**：每次练习成本（深度 / 速刷分开）、每活跃用户成本、每套餐单用户收入 vs 成本。盈亏平衡计算器：输入套餐价、月练习次数、档位组合，得出毛利。
- **收入**：收款流水（收款、退款、调整、赠送），字段含金额、币种、渠道、外部单号、手续费、发生时间、当时汇率。先手工录入。
- **支出**：服务器、域名、开发 Agent、法务、记账等，替代成本备忘录 §6 的周表。
- **对账**：每月录入供应商账单，与本地计算对比，差额超过 5% 标红。

### 6.7 运营、审计、系统

- 运营：功能开关当前值、注册开关、速刷与用户日额度（`quickBudget`）、题库版本与题目分布、别名候选审核队列。首期只读。
- 审计：所有 admin 写操作和破例查看，按操作者、对象、时间筛选。
- 系统：最近备份与保留策略、数据库大小、迁移版本、`llm:ping` 结果。

## 7. 计算口径

**单次调用成本**，结算时计算并写入，单位为整数微美元（1 USD = 1,000,000）：

```text
uncached = input_tokens − cache_read_tokens
cost = uncached × 输入价 + cache_read_tokens × 缓存读价 + cache_write_tokens × 缓存写价
     + output_tokens × 输出价            // OpenAI 兼容接口的 output 已包含思考 token
```

- `timeout`、`indeterminate` 或 usage 为空的调用，按 `reserved_input/output` 估算，`cost_estimated = 1`，报表单列。
- 历史调用按 `started_at` 匹配当时价格，一次性回填。
- 单次练习成本 = 同一 `sessionId` 之和；速刷按 `packageId`。
- 用户月毛利 = 当月分摊收入（订阅按周期天数分摊）− 当月模型成本。
- **币种（D3）**：交易按原币种存，同时存当时汇率。界面每个金额显示"¥主数字 · $副数字"。供应商价格以 USD 计，收入以 CNY 计；汇率来自 `fx_rates`（按日，手工或定时拉取），缺当日汇率时用最近一天并标注。TWD 只出现在记账导出。

## 8. 数据表

| 表 | 关键字段 |
|---|---|
| `users`（加列） | `role`（user / admin）、`status`（active / suspended）、`last_seen_at` |
| `providers` | id, name, kind, env_prefix, status, region, balance_source |
| `models` | id, provider_id, model_name, capabilities_json（json_mode、thinking）, status |
| `model_prices` | model_id, effective_from, effective_to, in / out / cache_read / cache_write（每百万 token，微美元）, tier_rules_json, currency, source_url, verified_at |
| `route_versions` / `routes` | version, group（tier / judge / quick）, key（adept / evaluate …）, call_site, model_id, params_json, max_output, timeout_ms, enabled |
| `calibration_runs` | route_key, candidate_model_id, mean_abs_delta, max_abs_delta, passed, report_path, at |
| `llm_calls`（加列） | `price_id`、`cache_read_tokens`、`cache_write_tokens`、`cost_micros`、`cost_estimated` |
| `usage_daily` | date, user_id, call_site, model_id, calls, tokens…, cost_micros（汇总表，避免 SQLite 全表扫描） |
| `plans` / `subscriptions` | 套餐价格与额度；订阅状态与周期 |
| `ledger_entries` | user_id?, type, amount_minor, currency, channel, external_ref, fee_minor, fx_to_usd, occurred_at |
| `expenses` | category, period, amount_minor, currency, note |
| `fx_rates` | date, base, quote, rate, source |
| `admin_audit` | admin_id, action, target_type, target_id, before_json, after_json, reason, at |

另给 `llm_calls(started_at)` 单独建索引，全站时间范围查询需要。

## 9. 权限与安全（D1）

- **nginx**：`location ^~ /admin` 与 `location ^~ /api/admin` 只 `allow` 运营者的 IP（或 VPN 网段），其余 `deny all`，返回 404。
- **应用**：`app/admin/` 独立路由组和 layout；layout 和每个 `/api/admin/*` 都在服务端调用 `requireAdmin()`；非管理员返回 404。Next 16 的守卫写法实现前先读 `node_modules/next/dist/docs/`（见 AGENTS.md）。
- **管理员来源**：`users.role = 'admin'`；首个管理员由 `ADMIN_EMAILS` 环境变量引导。
- **敏感操作**（删除账户、退款、改价格、改路由、更换 key、破例查看）要求重新输入密码，并写入审计。
- 写操作复用现有 Origin 校验与请求体大小限制。

## 10. 界面

- 沿用现有令牌（桌面 / 面板 / 纸面，钢笔蓝唯一强调色），做紧凑版：表格行高约 34px，数字用等宽数字，ID 用等宽字体。
- 详情用抽屉，不跳页；长表冻结表头；服务端分页与排序。
- 亮色、深色两套。

## 11. 分期

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0** | 管理员权限、nginx 限制、审计；`model_prices` + `cost_micros` + 缓存 token + 回填；总览；用户列表与详情（只读 + 暂停 / 撤销会话）；模型调用 | 无 |
| **P1** | `providers.env` 热加载与更换 endpoint / key；路由入库（含档位表与批改校准门槛）；价格影响预览；`usage_daily`；固定支出、汇率、对账 | P1 路由依赖 tutor_style_tiers 档位实现 |
| **P2** | 套餐、订阅、收款；损益与单位经济；运营项可编辑；破例查看 | 收费主体确定 |

## 12. 风险

| 风险 | 应对 |
|---|---|
| 后台被入侵即可换 key、导出数据 | nginx IP 限制 + 应用校验 + 敏感操作二次密码 + 审计 |
| `providers.env` 写坏导致所有调用失败 | 测试通过才保存；原子替换；`.prev` 一键回滚；解析失败时继续使用上一次成功解析的配置并告警 |
| 本地成本与账单不一致 | 读取缓存 token；超时按预留估算；月度对账 |
| 换批改模型导致分数断层 | 校准门槛；强制切换时标断点 |
| SQLite 聚合查询慢 | `usage_daily` 汇总表与 `started_at` 索引 |
