READY WITH CHANGES

第 8 节不能记为全部闭环：fresh 判定和开关组合仍有缺口，旧会话首次完成的规则也存在歧义。本次仅静态审阅，未修改文件、联网、调用技能或子代理，未运行测试。

第一轮逐项状态（重复提出的意见合并列出）：

- **resolved** — WP4 短事务、持久化回执、默认续写唯一性及禁止事后覆盖保存已写入。
- **resolved** — WP3 完整消息估算、协议余量及“保守准入估算”表述已写入。
- **resolved** — WP6 作文库与作文详情路由安排已明确。
- **resolved** — WP2／WP4 拆分、WP3 先定接口、统计提前至 WP6 已落实。
- **resolved** — 首次有效 evaluation 即完成；回顾独立失败与重试。
- **resolved** — 当前版本部分唯一索引及同版本内容冲突拒绝已明确。
- **resolved** — 旧题别名已有负责人确认，未命中与歧义可分别表达。
- **resolved** — 初始化保留旧基线，新结构只走追加迁移。
- **partially** — 提交前竞争资格已落实，但 fresh 条件与提交事实保存仍不完整，见阻塞项 1。
- **resolved** — 三段式锁、持久化运行状态及 Quick 独立控制器已明确。
- **resolved** — 冻结操作输入、预留失败禁调、结算失败保留预留及逐次重试预留已明确。
- **partially** — 开关与只读分派已补齐，但合法组合仍无法按现有推荐规则运行，见阻塞项 3。
- **resolved** — WP1 多版本、歧义、缺要求及导入回滚验收已补。
- **partially** — WP3 故障测试已补，第一轮要求的跨卡片并发预留测试未明确列出。
- **resolved** — Quick 刷新读取接口已补。
- **resolved** — 检查点共用占用检查、拒绝时保存自报、关闭／删除释放占位已补。
- **resolved** — 卡片复习不另建材料库已明确。
- **resolved** — WP1 前四项决定均已由负责人明确答复。

仍需修订的阻塞项：

1. **fresh 判定漏掉既有反馈，且把提交事实更新绑定在 fresh 分支。**  
   [12:102](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:102)仅检查 `deep_original_submitted = none` 和非重写，没有检查 `prior_feedback`，与 [RFC:114](/Users/chen/Desktop/opc/docs/designs/question_bank_first_practice.md:114)冲突；文字也只在 fresh 分支更新提交事实。一次因历史不确定而判 unknown 的真实提交，仍须留下已提交事实，否则历史解析后可能错误恢复首次资格。  
   **修复：**接受原稿时先读取既有事实，计算资格，再无条件保存本次不可变提交标记。fresh 必须同时满足无既有提交、无既有反馈、非重写且历史已知；明确重写／已知重复为 repeat，仅剩余不确定情形为 unknown。按 attempt 保存资格，评分重试读取原值。

2. **旧的未完成会话可能永远无法获得首次完成事件。**  
   [12:104](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:104)笼统规定旧记录“重评……不新建事件”，但 [RFC:89](/Users/chen/Desktop/opc/docs/designs/question_bank_first_practice.md:89)允许没有历史完成事件的旧会话，在迁移后首次满足反馈合同获得当前完成。例如旧原稿已提交、评分一直失败，之后首次成功。  
   **修复：**将“不新建事件”限定为已有完成事件的会话；没有事件者首次满足合同仍原子写入当前 `completed_at`，未知的历史提交时间保持空值。补上述失败后首次成功用例。

3. **题库开启、Quick 关闭时，推荐会指向被禁止的动作。**  
   [90:183](/Users/chen/Desktop/opc/原型/90_共享规范.md:183)允许该组合，但 [RFC:110](/Users/chen/Desktop/opc/docs/designs/question_bank_first_practice.md:110)要求未练主题推荐 Quick；[12:113](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:113)的推荐输入也没有 Quick 能力状态。此外，[99:232](/Users/chen/Desktop/opc/原型/99_实现清单.md:232)要求“速刷 → 推荐”，与 Quick 依赖题库开关相冲突。  
   **修复：**明确分阶段行为：建议 Quick 关闭时新活动推荐退化为 Deep，并排除只读 Quick 的自动继续入口；把有效能力状态传入推荐函数，补组合测试。上线顺序同步改为题库／推荐 → Quick → 检查点。

非阻塞备注：

- [13:47](/Users/chen/Desktop/opc/原型/13_速刷与主题卡片.md:47)应定义 `seq` 的服务端分配依据，确保换请求 ID 不会把同一次追问变成第二次追问。
- WP3 补“两个卡片同时预留，仅剩一次用户额度”的竞争测试。
- [12:38](/Users/chen/Desktop/opc/原型/12_题库与推荐.md:38)的冻结内容比较应明确包含 `requirements_json`，避免同题同版本的检查标准被覆盖。