# 题库优先练习 RFC：团队评审反馈

> 历史报告：本文针对修订前 RFC；题目与行号链接现指向保留的原始快照。2026-11-01 的修订和闭合结果见 [修订复审记录](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_revision_review_20261101.md)。

评审日期：2026-11-01（Asia/Taipei）  
对象：[question_bank_first_practice.md](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md)（297 行）  
结论：**可以开始正式设计；当前版本尚不能直接作为试用规格。** 没有发现必须推翻 topic-first 方向的问题。主要缺口是几条规则尚未覆盖所有状态，以及实现它们所依赖的数据口径尚未统一。

这是一轮 RFC 团队反馈，不是完整的 EGM 五阶段审查，也不是上线批准。使用三个全新上下文、只读子代理独立审阅，再由主代理复核关键代码、去重和裁决。未修改 RFC、concepts brief 或业务代码，未调用付费模型接口、操作数据库或服务器。

## 1. 评审成员与结论

| 成员 | 主要职责 | 独立结论 |
| --- | --- | --- |
| P：产品与体验 | 用户路径、范围、简化与反例 | 可以进入设计；补齐推荐空候选、自由重做、删除历史和 unchecked 卡片路径 |
| E：工程与数据 | 当前代码契约、身份、持久化、迁移 | 可以起草；明确活动关系、完成事件、曝光记录和问题编码前提 |
| V：评测与成本 | 检查点有效性、预算、试用指标 | 尚不具备试用条件；给出待验证的题库及 Quick 限额起始提案 |

三位均完整读取当前 RFC。Round 2 为现行方案，Round 1 为历史；已解决的问题没有按旧版本重新报错。评审员可见 RFC 内嵌的历史结论，因此“独立”指彼此未共享推理、未继承本次聊天，不表示对历史评审完全盲测。

## 2. 需要写进正式设计的六项反馈

### R1 · Major：推荐规则仍存在空候选和保留题冲突

**证据：** [RFC 第 68 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:68) 的分支及 [第 108 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:108) 的保留题限制。P、E、V 三位独立发现。

两个反例：

- 普通题 A/B 都已完成 Deep，R 是未做的保留题。按“每道题都有完成的 Deep”尚未耗尽；未尝试候选却只有禁止推荐的 R。最后才过滤 R 会得到空候选。
- A/B 都开始了 Deep，但都未完成，也没有 Quick 卡。它们既不是未尝试，也不是“有卡、没有完成 Deep”；恢复草稿分支又只处理卡片。

首页 Continue 和自由选题能帮助用户绕开问题，但不能使主题内推荐规则完整。

**最小修订：** 先定义不含保留题的普通推荐池，候选与耗尽都使用该集合；明确未完成 Quick、待复查卡、未完成 Deep 的恢复顺序及多个对象的稳定排序；普通题池为空时返回可解释的空状态。把“决定返回哪条推荐的分支”和后续 activity、题型、focus 处理分开描述，避免“首个分支命中即结束”的歧义。

**验收：** 上述两个反例；只有保留题的话题；存在多个草稿；卡片通过后被编辑。都不意外推荐保留题、不自动复制已有未完成练习。

**门槛：** 不阻止起草；推荐功能试用前解决。

### R2 · Major：Quick→Deep 的计数已决定，实体关系仍未决定

**证据：** [RFC 第 46 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:46)、[第 113 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:113)、[第 125 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:125)。E 发现。这是 Round 1 已提出、Round 2 尚未完全关闭的事项，不应称为全新发现。

学生周日完成 Quick，周一继续成 Deep。如果只改原 session 的 activity，如何同时保留两种活动及两个完成时间？如果新建 Deep，重复点击、来源卡修改、删除其中一个如何处理？当前 sourceAttemptId 用于重写，不能不加区分地同时表达 Quick 延续，否则可能误把正常延续排除于原稿证据。

**建议方案，待产品采纳：** 保留 Quick attempt/card，创建独立 Deep attempt；关系明确区分“从 Quick 延续”和“重写既有 Deep”。延续操作可重试，并返回同一次已创建的 Deep；需要另开练习时使用明确的新建动作。Deep 带入当时的卡片快照，源卡后续编辑不修改已提交作文；删除源活动后的引用展示和计数规则另作明确约定。

**验收：** 跨周分别计一次；重复请求不重复创建；源卡编辑不改历史作文；Quick 延续与反馈后的重写不会混为一种证据。

**门槛：** 不阻止起草；数据模型定稿和延续功能试用前解决。

### R3 · Major：“完成”的定义必须被所有功能共用

**证据：** [RFC 第 111 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:111) 以首次展示反馈计 Deep credit，推荐耗尽与首次检查点却仍写 finished Deep。当前 [engine.ts 第 58 行](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:58) 会在额外 review 调用前保存 evaluation；[essay-view.ts 第 11 行](/Users/chen/Desktop/opc/lib/learning/essay-view.ts:11) 有 evaluation 就允许反馈面板；[engine.ts 第 85 行](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:85) 的 finished 又依赖 finish 模型调用。E 发现，主代理复核。

因此，“部分反馈可见”“完整反馈已保存”“用户实际看过”“会话已关闭”目前不是同一件事。只改周计数，会出现本周已计完成、首页却继续催做，或检查点始终不出现。旧记录没有可信的独立完成时间，也不能用迁移当天冒充。

**最小修订：** 选定一个可持久化、幂等的服务端完成事件，并说明哪些反馈是必需的。若坚持“用户看过”才完成，就定义对应确认事件。推荐、首次检查点、周计数、题型计数和试用指标共用这一口径；是否继续改写、是否关闭会话作为另外的状态。定义“最近两篇”采用的原稿时间。历史完成时间无法还原时标记 unknown，不用 createdAt、updatedAt 或适配器运行时间猜测。

**验收：** review 失败但已有评分；反馈保存后响应丢失；不点 finish；完成后再改写；旧记录再次保存；周日开始周一完成。

**门槛：** 不阻止起草；相关统计与推荐试用前解决。

### R4 · Major：复发重点需要入口无关的原稿定义和可信的问题编码

**证据：** [RFC 第 75 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:75)、[第 82 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:82)；[engine.ts 第 51 行](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:51) 的评分提示词没有提供分类表，[schemas.ts 第 28 行](/Users/chen/Desktop/opc/lib/pipeline/schemas.ts:28) 的 issue.code 允许任意短字符串。分别来自 P、E，主代理复核代码。

这里有两个独立缺口：

1. 学生看过 A 的反馈后，从自由选题入口再次做 A。RFC 只明确要求推荐产生的重写保存链接，尚未定义这个自由入口是否也属于重写。若不识别，同一道题就能凑成两篇 fresh original。
2. 当前返回 code 可能同义不同码，或同码不同义。直接做交集和 taxonomy 排序不能保证得到规则承诺的证据。

**最小修订：** 定义 fresh original，与入口无关；建议同一题已看过反馈后的重做不再增加独立复发证据，但仍计 Deep 活动。为新评分输出提供固定分类定义并校验编码，未知或旧自由编码保留展示，不能猜测映射。缺乏合格证据时不附 focus。报告中没有某问题，也不自动等同于经过完整检查后判定不存在。

如果首轮只验证题库、卡片与题内推荐，可以明确暂不开启 recurrence focus；这是一项缩小范围的建议，并非本次已替产品作出的决定。

**验收：** 从自由入口重做；不同题的两篇合格原稿；非法 code；旧自由 code 与新 T06 混合；T06 与不适用题型；合法证据不足时没有 focus。

**门槛：** 不阻止起草；启用 recurrence focus 前解决。

### R5 · Major：模考资格不能靠删除历史恢复，“未练过”也不等于“从未见过”

**证据：** [RFC 第 53 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:53)、[第 105 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:105)、[第 126 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:126)；[sessions.ts 第 30 行](/Users/chen/Desktop/opc/lib/db/queries/sessions.ts:30) 实际删除会话。P、E、V 从不同侧面发现。

- 做过保留题 A 后删除会话，当前 session 列表已无 attempt。若资格仅从现存记录推导，A 可能重新变成“独立”基线。
- 一个无法匹配的旧 session，会使哪些题的 exposure 成为 unknown，尚无范围规则。
- 题库可以自由浏览。没有 attempt 只能证明应用内未作答，不能证明学生没看过题、没在线下准备。

**最小修订：** 明确删除作文不把已接触恢复为未接触。可保留用途明确、不含作文正文的最小接触记录；若要求清除相关证据，资格须保守处理，不能自动变成 unseen。账户删除仍清除全部相关数据。为旧题 alias 和 unknown 明确可执行范围及冲突处理。

对于“独立”有两条可选边界：收窄为“应用内未练习、当次无辅导”；或额外记录题目揭示并收集外部见题自报。后一方案也无法证明真实世界完全没见过，不应作更强保证。第一次正式模考揭题不得被自身的揭示事件错误排除。非独立重复模考可以保留展示，但应与用于基线／独立趋势的序列区分；当前 [progress/page.tsx 第 17 行](</Users/chen/Desktop/opc/app/(main)/progress/page.tsx:17>) 只按 mock 过滤，需在设计中对应调整。

**验收：** 练习→删除→检查点；旧 ID 精确匹配；无法匹配旧题；只浏览未作答；外部练过自报；账户删除；不合格重复模考仍可练但不进入独立序列。

**门槛：** 不阻止起草；独立检查点启用前解决。是否将检查点纳入首轮，应在设计首页说明。

### R6 · Major / Nit：卡片来源和编辑后的状态还差最后一段定义

**证据：** [RFC 第 39 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:39)、[第 46 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:46)；当前 [session-store.tsx 第 185 行](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:185) 的直接编辑只有“用户编辑”标记。来源问题由 E 提出，unchecked 展示由 P、E 提出。

RFC 允许学生直接填写卡片，却要求每部分都有学生消息 ID；直接填写可能根本没有聊天消息。不能为了填字段而随意关联上一条消息。通过后编辑变成 unchecked，但题目指示器只列 passed/draft，恢复规则也只写 draft。

**最小修订：** 来源区分直接输入的编辑记录和本人消息中的精确选取，前者不伪造消息 ID，后者核对本人、用户角色和原文。复用旧 prewriting 的对话能力，不将模型整理的槽位自动认定为学生原文。将 unchecked 明确为待复查草稿，仍恢复同一卡；历史首次 credit 与完成时间不因复查而重复生成。

文字来源只能证明“谁输入了文字”，不能单独证明论点没有先由教练提供。作者归属抽查需要看完整对话，而不只看 source ID 或通过的卡片。

**验收：** 不发聊天、全程直接填写；选本人原文；拒绝 coach／他人来源；通过→编辑→复查仍为同一卡；旧检查结果不得覆盖新编辑。

**门槛：** 不阻止起草；卡片功能定稿时补齐。来源契约为 Major，unchecked 展示是较小的 Nit，不应夸大为架构阻断。

## 3. 已承认的待定事项：给团队讨论的起始值

以下不是已验证参数，也不是产品已批准的决定。它们用于让下一次讨论具体化，需用真实内容和目标模型验证后再冻结。

### O1 · 题库：建议先讨论 38 题方案

- 普通题：7 个话题 × 每话题 4 题 = 28 题。
- 保留题：5 种题型 × 每种 2 题 = 10 题。
- 合计 38 题。普通题须整体覆盖五种题型，但不要求每个话题都有五类题，不恢复已放弃的满格覆盖矩阵。

假设六周试用、每人每周三次普通活动，共 18 次；即使每次换题，28 道普通题在全库层面有余量。但集中在一个话题仍会耗尽，这是重写分支应该处理的状态。

以第一次检查点在 day 0 为上界估算，六周窗口 [0,42 天) 最多在 day 0/14/28 出现三次；若额外包含 day 42 的期末检查，则最多四次。10 道保留题的后一个保守情形允许最多六道提前被自由练习消耗，但这只是总量算术，不是供给保证；还取决于题型选择、旧曝光和用户自由使用情况。耗尽时仍使用 unavailable 降级。

初始话题数、每周活动量和试用时长都是本提案的假设。题目来源及标签审校需作为内容准备任务落实；本次没有核查题目来源或变更“真题”的产品承诺。

### O2 · Quick：建议先讨论初始预算包，再明确同一卡片的复查政策

| 项目 | 待验证起始值 |
| --- | --- |
| 学习交互 | 最多 2 次追问 |
| 检查 | 1 次初检 + 1 次主动复检 |
| 失败重试 | 初始预算包合计最多 1 次额外尝试；自动仅用于格式恢复，手动重试共用此额度 |
| provider 请求数 | 初始预算包最多 5 次，不因网络失败或重新点击而增加 |
| 单次完整输入 | 最多 4,000 tokens，包含系统提示与 schema |
| 单次输出 | 追问最多 512，检查最多 768 tokens |
| 单请求时间 | 最多 25 秒，并服从剩余累计预算 |
| 累计模型等待 | 最多 100 秒，不含学生思考时间 |

以上数值适用于一个 attempt 的初始预算包，而不是卡片终身额度。该预算包的最坏输入上限为 5 × 4,000 = 20,000 tokens；最坏输出为 2 × 512 + 3 × 768 = 3,328 tokens。重试不会增加累计时间预算，因此五次请求不能都耗满 25 秒。此处未使用任何当前模型价格估算费用。

resume、重复请求、刷新不能重置当前预算包。达到上限时仍保存文字，可手动编辑或转 Deep，不能虚构通过；超长输入应提示并保留原文，不能悄悄截断后声称检查完整。每次 provider 请求记录 operation、耗时、token、失败类别；无法获知的超时用量标为 unknown，不能写零。新建 attempt 不应绕过用户级总配额，其具体阈值另定。

**复核发现的一处取舍：不能把这个初始上限当成卡片终身上限。** 否则两次检查用完后，学生以后再编辑已通过卡，就永远无法复查同一卡，违背 R6 的生命周期。建议同一卡允许用户明确申请后续检查预算，受冷却／用户累计配额约束；既有 attempt 的历史调用与用量总账保留，页面恢复和重发不自动发新额度。追加额度、冷却及用户总上限仍须定案；在此之前，这组数字只是初始讨论提案，不能声称整个 attempt 的终身成本已被封顶。

现有 [client.ts 第 13 行](/Users/chen/Desktop/opc/lib/llm/client.ts:13) 是每逻辑调用最多两次 provider 尝试，max_tokens 为 16,000，约 120 秒预算由两次尝试共享；不是每次尝试各有 120 秒。[admission.ts 第 11 行](/Users/chen/Desktop/opc/lib/llm/admission.ts:11) 已有并发及分钟频控，但它不是上述 attempt 累计预算。

### O3 · 试用成功标准：还缺一张可复算的指标表

这是 RFC 已接受但尚未定数值的事项，不是新漏洞。正式设计应先固定比较对象、时间窗、参与者分母、零活动周和退出者的处理：

| 要回答的问题 | 建议统计口径 |
| --- | --- |
| 是否接触更多内容 | 每人每周分别统计 distinct topic、question、question type；分清仅开始与实际完成 |
| 是否少写了作文 | 完成 Deep / 纳入的用户周，包含零活动周；另拆首次原稿与重写 |
| 卡片是否有用 | 实际复习使用及反馈；报告答复人数，避免只看愿意评价的人 |
| 是否仍是自己的想法 | 抽查完整对话及卡片，包括失败、未通过和超时样本 |
| Quick 是否及时且可负担 | 成功、失败、放弃各自的等待与用量；成本分子包含失败和重试 |
| 检查点能否比较 | 明确资格与完成条件，重复题和未知历史单列 |

新用户没有历史基线时，需对照条件，或将本轮明确定位为描述性的可用性试用，不能据此声称 Deep 数量“没有下降”。小样本不必假装能证明统计显著性，但仍必须能复算数字。具体通过阈值应在试用前选定；本评审不将随意设定的百分比包装成研究依据。

## 4. 主代理裁决：保留哪些决定，哪些批评不应扩大

- 保留 topic-first 与自由选题。它对话题广度只有软引导，RFC 已诚实承认；没有证据要求恢复强制序列、覆盖网格或 agent 排名。
- 保留 Quick 不进 issue memory、卡片只保存学生文字、Deep completion 不等待可选 finish 文案的方向。
- 保留先扫描已有 sessions，实测有问题再加 summary table。不能因将来可能扩容，就要求本轮建设新数据管线。
- **不把分布式锁列为当前缺陷。** [README 第 131 行](/Users/chen/Desktop/opc/README.md:131) 仅支持单个常驻 Node 进程；现有 [会话锁](/Users/chen/Desktop/opc/lib/pipeline/lock.ts:6) 覆盖模型 await，PATCH/DELETE/actions 共用它。仍需保留重试、迟到结果、删除、回滚的验收，但无充分理由现在引入队列或多副本架构。
- RFC 无需现在写出所有 SQL、接口和代码步骤。上述反馈要求的是产品行为和数据含义闭合；这些完全可以在正式设计中解决，不必先重开 brainstorm。
- 简短首轮可以只含题库、Quick 卡片、题内推荐与必要统计；focus 和独立检查点可分期，但必须由产品明确范围。不能暗中省略承诺功能后声称完整方案已通过。

## 5. 文档整理建议

[RFC Overview 第 13 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:13) 仍首先描述旧覆盖图／宽深双线，随后才说明 Round 2 替代；[第 268 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:268) 也还提到依赖 grid。正式设计应把现行决定放在开头，旧轮次移至决策记录或明确标为历史。[第 264 行](/Users/chen/Desktop/opc/docs/reviews/question_bank_first_practice_rfc_before_20261101.md:264) 的“复用 prewriting”须受学生原文规则约束。

RFC 与 concepts_brief 当前只有状态行不同。后续建议指定 RFC 为当前讨论入口，brief 保留为历史输入，并用单向链接说明关系，避免两份继续分别修改。没有 SITEMAP.md 不是本次设计阻断，也不需要为了登记一份 RFC 新建一套文档管理制度。

## 6. 追溯与后续验收

| 汇总项 | 原始评审来源 |
| --- | --- |
| R1 推荐状态覆盖 | P1、E1、V1 |
| R2 Quick→Deep 身份 | E3 |
| R3 完成事件 | E4；V4 的指标要求相关 |
| R4 复发证据 | P2（自由重做）、E5（编码契约） |
| R5 检查点资格 | P3、E2、V2 |
| R6 卡片来源和编辑状态 | E6、P4、E1；V4 的作者归属抽样相关 |
| O1 题库容量 | V1；三位均识别为已知待定 |
| O2 Quick 累计预算 | V3；E 确认现有客户端约束 |
| O3 试用指标 | V4；P 验收建议 |

实现后的验证清单还应包括：单一卡片／首次 credit 唯一；事务提交后响应丢失再重试；检查期间编辑和删除；账户删除后的迟到结果；兼容回滚构建明确拒绝不支持的 Quick 动作；旧 session 保存保留未知字段。这些是后续验收要求，本轮没有执行运行时测试，也没有声称它们已通过。

本轮阅读了 RFC、相关原型规范、README，以及 session API、存储、状态、评分、记忆、模型客户端和相关前端入口。没有用历史提交代替当前工作区；工作区已有大量未提交业务文件，因此只能确认两个文档当前未提交，不能仅凭 git status 判断 Claude 先前那一轮是否改过代码。

审阅时 Git HEAD：`9a782c0304bb5a17fb02dc8a8d5dee99691b8a70`。  
RFC SHA-256：`0387225cd2d446c16b69a0c10876008cb3fd6866229ecfd98b3494302f2898bd`。  
concepts_brief SHA-256：`b1e944c55f8e8a5cea15993e7263cf7111c08e05a9a017dcef7f105fad812132`。
