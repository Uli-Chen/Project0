READY WITH CHANGES

本次仅做静态审阅，未修改文件、联网、调用技能或子代理；未运行会生成文件或数据库的检查。以下阻塞项需要先写入修订方案。

**第 8 节逐项回答**

1. **WP4 的事务与去重。**在 `lib/db/queries/cards.ts` 新增 `commitQuickMutation`，使用同一数据库连接的同步短事务：重新读取会话与卡片、验证所有者及版本、修改卡片和会话 JSON、增加会话版本、写入请求回执；检查通过时同时写结果及首次完成事件。禁止事务后再由路由统一 `persist(session)`，否则可能覆盖并发编辑。

   `completedRequests` 保留为客户端兼容投影，不能作为唯一保证：当前只保留最近 50 项，且与业务保存分开执行（[actions/route.ts:27](/Users/chen/Desktop/opc/app/api/sessions/[id]/actions/route.ts:27)）。新增持久化请求回执，保存请求键、参数摘要、操作／子会话 ID；换请求 ID 的模型重复调用由 `quick_operations` 的逻辑唯一键拦截。默认续写由 `default_continuations` 保证唯一；明确另开按幂等键去重。重复请求重新组装 `{session, card, operations, budget}`。

   模型动作分三段：**锁内预留事务 → 释放锁调用模型 → 重新加锁提交事务**。提交时重读最新状态；版本变化只结算额度并记 `stale`，删除后不得使用现有 upsert 保存函数重建会话。

2. **WP3 的 token 估算。**在 `lib/llm/client.ts` 抽出 `buildMessages`，对实际发送的完整消息计算 UTF-8 字节数，再加版本化的协议开销余量；包含系统提示、JSON Schema、上下文及重试提示。不采用英文字符数除以四。将其明确标为保守准入估算，不能声称是任意兼容模型的精确 token 上界；真实 usage 单独记录，未知则保留预留。Quick 超过 4,000 时拒绝调用并保留内容，默认 Deep 行为不变。

3. **WP6 路由。**作文库放 `app/(main)/essays/page.tsx`，作文页保留 `app/essays/[id]/page.tsx`，共同继承根 `app/layout.tsx`，只有列表继承侧栏。两者 URL 分别是 `/essays`、`/essays/[id]`，不存在重复页面路径。保留现有 `/sessions/[id]` 重定向。已核对本地 Next.js 路由分组文档。

4. **粒度与顺序。**WP2、WP4 明显偏大。建议 WP2 分成“兼容读取与回滚壳”“历史扫描与提交／完成事实”“创建、生命周期及删除”；WP4 分成“卡片与续写事务”“额度、模型操作及恢复”。WP3 应先确定逐次 provider 尝试的预留／结算接口，否则 WP4 必然返工。完成事件的统计聚合提前到 WP6，WP7 专注检查点。

5. **冲突位置与修订**见以下阻塞项。

**阻塞问题**

- **完成边界判断错误。**[方案:78](/Users/chen/Desktop/opc/docs/plans/2026-11-01_question_bank_dev_plan.md:78)、[12:84](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:84)把第二次调用当作必需问题反馈。但 [engine.ts:51](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:51)第一次已返回分数、issues、原因及提示；第二次只是提纲回顾。这与 [RFC:82](/Users/chen/Desktop/opc/docs/designs/question_bank_first_practice.md:82)冲突。应在首次有效 evaluation 持久化时，将会话置为可查看反馈并原子写完成事件；可选回顾使用独立状态及重试，不重跑评分。同步改写 12 的验收用例 1。“不改评分与诊断”应明确允许修改编排和保存边界，保持评分输入不变。

- **WP1 的版本约束不成立。**[12:32](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:32)要求 `bank_order` 全表唯一，导入同题 v2、保留 v1 时会冲突。改为仅当前版本的顺序唯一，并对当前 `id` 建部分唯一索引；同一 `(id,version)` 内容不同应报错，不覆盖冻结版本。

- **三个旧 ID 不能全部映射进冻结目录。**[方案:65](/Users/chen/Desktop/opc/docs/plans/2026-11-01_question_bank_dev_plan.md:65)要求三个旧内置 ID 的别名；但 [initial.ts:4](/Users/chen/Desktop/opc/lib/pipeline/initial.ts:4)中的免费大学教育、年轻人迁入大城市，在 38 题中没有对应题。远程办公可经人工确认映射到 `qb_mock_work_002`；其余应保留未解析状态，不按主题硬配。另外，[12:63](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:63)的唯一别名表无法表达多候选歧义：需增加明确的歧义状态或候选关系，解析结果区分命中、未命中、歧义。

- **迁移方式互相冲突。**[方案:49](/Users/chen/Desktop/opc/docs/plans/2026-11-01_question_bank_dev_plan.md:49)要求同步修改初始化函数；[README:127](/Users/chen/Desktop/opc/README.md:127)明确禁止。当前 `db:migrate` 先执行初始化，普通生成迁移再建相同表会发生冲突。建议保持 `initializeSchema` 为旧基线，新结构只进追加迁移；同步修改 12、13，并测试空库和已有数据升级。

- **fresh 判定会误记历史与并发提交。**[12:88](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:88)将首次提交时间为空直接判 fresh，无法区分“从未提交”和“提交过但日期未知”，也漏了已有反馈。按 [RFC:114](/Users/chen/Desktop/opc/docs/designs/question_bank_first_practice.md:114)，应在接受原稿的事务——当前 [engine.ts:46](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:46)附近——保存不可变提交标记并竞争首次资格，不能等评分完成。增加独立的历史提交／反馈存在标志；重写为 repeat，未解决历史为 unknown。粘贴入口即使 `question=null`，也应解析可识别家族，避免绕过重复判定。

- **现有锁不能原样沿用。**[actions/route.ts:19](/Users/chen/Desktop/opc/app/api/sessions/[id]/actions/route.ts:19)持锁等待整个模型调用，[lock.ts:7](/Users/chen/Desktop/opc/lib/pipeline/lock.ts:7)直接拒绝并发请求，无法通过 [13:120](/Users/chen/Desktop/opc/原型/13_速刷与主题卡片.md:120)的检查中保存新版用例。采用上面的三段式锁；运行状态改读持久化操作记录，不能继续把“锁已释放”解释成请求中断。Quick 需要对应的客户端控制器，不能直接复用现有 `SessionProvider` 的忙碌判断。

- **恢复缺少持久化输入，额度日志规则也需分开。**[13:62](/Users/chen/Desktop/opc/原型/13_速刷与主题卡片.md:62)要求重试同一快照，但表结构只保存当前卡片和无正文操作记录，重启后无法还原旧版本输入。增加随会话级联删除的操作输入快照，冻结题目要求、卡片、对话及配置版本。另将 [方案:92](/Users/chen/Desktop/opc/docs/plans/2026-11-01_question_bank_dev_plan.md:92)改为：普通观测日志可尽力写入；Quick 预留失败不得调用，结算失败保留预留。每次自动重试都必须重新预留，并消耗包内共享重试额度。

- **开关与回滚合同不完整。**[方案:55](/Users/chen/Desktop/opc/docs/plans/2026-11-01_question_bank_dev_plan.md:55)要求所有新功能默认关闭，但仅列三个开关，没有推荐／首页切换开关；[99:232](/Users/chen/Desktop/opc/原型/99_实现清单.md:232)却要求推荐单独启用。建议增加 `QUESTION_BANK_ENABLED`，定义与 Quick 开关的组合行为。WP2 还须在页面进入 `SessionProvider` 前分派只读视图，并让未知会话的动作及 PATCH 明确返回 409。新流程须关闭 [sessions/route.ts:17](/Users/chen/Desktop/opc/app/api/sessions/route.ts:17)的旧自动 focus 注入，不能只让新推荐函数返回 null。

**非阻塞建议**

- WP1 用“同题 v2 导入、别名歧义、缺要求记录、事务整体回滚”作为验收，不能只验证重复导入。
- WP3 使用可控时钟与延迟假 fetch，覆盖跨卡片预留、未知 usage、结算失败和响应丢失。
- WP4 明确 Quick 刷新读取接口，返回卡片、操作及预算；当前 GET 只有 session/busy。
- WP7 所有创建入口共用家族检查点占用检查；明确拒绝声明后的外部练习事实也要保存，关闭／删除检查点要释放进行中占位。
- 91 §5.5 的“先列理由与例子”应明确只是现存卡片内容的呈现，不另建材料库或自动提取。

**WP1 前请负责人／创始人明确**

1. 是否采用“旧基线初始化不变，新增结构全部走迁移”，并修订方案及 12、13？
2. 是否接受两个无对应题的旧 ID 保留未解析，并由负责人确认远程办公别名？不得为满足三个命中而修改冻结题库。
3. 是否批准当前版本部分唯一索引、可表达歧义的别名结构，以及独立题库开关？
4. 是否确认首次 evaluation 已满足必需反馈合同，并允许 WP2 调整编排、完成事务和可选回顾状态？