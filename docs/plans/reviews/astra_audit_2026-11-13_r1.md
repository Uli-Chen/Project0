审查基于 `redesign@cb26097`，已读 `AGENTS.md` 和相关本地 Next.js 文档。全程只读、离线，未调用模型、未修改文件；未审查自由输入教练方案。以下共 32 条，布局与浏览器行为未实测的部分标明“待确认”。复习排期和错句消失问题已用离线纯函数验证。

1. **[P0] 功能：速刷冲突后的“刷新状态”会让旧草稿覆盖另一页面的新修改。**  
   位置：[components/quick/quick-screen.tsx:138](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:138)、[components/quick/quick-screen.tsx:240](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:240)  
   现象：两个标签页编辑同一卡片；另一页保存后，本页保存冲突。点击“刷新状态”只更新服务器版本，不合并 `draft`；随后继续输入或离开触发保存，会用新版本号提交全部旧字段，覆盖另一页的内容。  
   建议：保留编辑开始时的基准，按字段做三方合并；冲突字段要求用户选择。不能只更新版本号后允许整张卡覆盖。

2. **[P0] 功能：作文保存收到确定的校验失败后，会永久重发错误快照。**  
   位置：[lib/prototype/session-store.tsx:70](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:70)、[lib/pipeline/schemas.ts:12](/Users/chen/Desktop/opc/lib/pipeline/schemas.ts:12)、[components/essay/essay-editor.tsx:122](/Users/chen/Desktop/opc/components/essay/essay-editor.tsx:122)  
   现象：编辑器允许粘贴超过 30,000 字符，自动保存返回 400；`pendingWrite` 没有清除。即使删回合法长度，后续保存仍发送原来的超长内容，保存、提交和暂放都无法恢复。  
   建议：仅在结果不确定的网络失败中保留原请求；确定未写入的 400/413 应清除快照，下一次从当前内容构建请求。前端同步显示长度限制。

3. **[P0] 功能：正在编辑的提纲不参与自动保存和离开保护。**  
   位置：[components/outline/outline-board.tsx:90](/Users/chen/Desktop/opc/components/outline/outline-board.tsx:90)、[lib/prototype/session-store.tsx:176](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:176)  
   现象：提纲文字只存在 `SlotRow` 的局部状态，失焦或按 Enter 才提交。用户持续输入后直接刷新、关闭标签页，父级仍认为没有未保存修改，当前字段可能整段丢失。  
   建议：输入时立即更新统一草稿状态，由统一防抖负责保存；Escape 需要撤销时恢复进入编辑前的值。所有提纲输入都应进入脏状态检测。

4. **[P0] 功能：教练消息在请求前置保存失败时，会清空且无法跨刷新恢复。**  
   位置：[components/coach/composer.tsx:41](/Users/chen/Desktop/opc/components/coach/composer.tsx:41)、[lib/prototype/session-store.tsx:120](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:120)、[lib/prototype/session-store.tsx:144](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:144)  
   现象：作文已保存，用户输入长消息后在断网状态发送；输入框立即清空，但前置 `saveNow()` 失败，消息尚未进入服务器 `pendingAction`。恢复输入仅处理 `retryable === false`，此时不成立；刷新后消息丢失，离开保护也不检查 `failedInput`。  
   建议：发送失败统一恢复原文或保留独立的失败消息草稿，并纳入离开保护；服务器确认接收前不要丢弃唯一可恢复副本。

5. **[P0] 交互：手机端改写时跳回原稿后，没有入口切回改写稿。**  
   位置：[components/essay/feedback-tab.tsx:33](/Users/chen/Desktop/opc/components/essay/feedback-tab.tsx:33)、[components/essay/essay-topbar.tsx:88](/Users/chen/Desktop/opc/components/essay/essay-topbar.tsx:88)、[components/essay/essay-body.tsx:22](/Users/chen/Desktop/opc/components/essay/essay-body.tsx:22)  
   现象：宽度小于 768px，改写期间点击已经修改过的问题句，定位逻辑切到原稿；版本切换却被 `hidden md:flex` 隐藏。正文变成只读，阶段没有改变，也不会自动切回，只能刷新等绕路恢复。  
   建议：所有宽度保留版本选择；窄屏可用紧凑下拉，查看原稿时明确提供“返回改写”。

6. **[P1] 功能：浏览器返回没有接入两种练习的离开保护。**  
   位置：[components/essay/deep-leave-guard.tsx:43](/Users/chen/Desktop/opc/components/essay/deep-leave-guard.tsx:43)、[components/quick/quick-screen.tsx:165](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:165)  
   现象：保护仅覆盖链接点击与整页卸载，同站浏览器返回不走这些入口。未发送回答、尚未完成防抖保存的文字可能随页面卸载丢失。**待确认：需浏览器验证当前 Next.js 返回缓存的实际恢复行为，不能将缓存当作保存保证。**  
   建议：建立覆盖历史导航的草稿恢复机制；至少在页面离开时保留可恢复副本，并在返回时提示恢复。

7. **[P1] 功能：保存冲突提供的“下载草稿”漏掉提纲和未发送消息。**  
   位置：[lib/prototype/session-store.tsx:65](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:65)、[lib/prototype/session-store.tsx:248](/Users/chen/Desktop/opc/lib/prototype/session-store.tsx:248)  
   现象：冲突提示要求“下载当前草稿后刷新”，但下载文件只有题目、原稿和改写稿。用户照做后，本地未保存提纲及教练文字没有备份。  
   建议：恢复用导出包含全部提纲字段、作文、未发送及失败消息；按钮改为“备份当前内容”，导出成功后再提示刷新。

8. **[P1] 功能：作文教练明确提供可直接插入的句子，违反本次产品标准。**  
   位置：[components/essay/coach-tab.tsx:17](/Users/chen/Desktop/opc/components/essay/coach-tab.tsx:17)、[prompts/coach-v2/express.txt:1](/Users/chen/Desktop/opc/prompts/coach-v2/express.txt:1)、[prompts/system/coach-preamble.txt:5](/Users/chen/Desktop/opc/prompts/system/coach-preamble.txt:5)、[components/coach/suggestion-card.tsx:38](/Users/chen/Desktop/opc/components/coach/suggestion-card.tsx:38)  
   现象：“英文怎么说”、润色、检查及三级提示允许生成完整句子，并提供“插入到光标处／采用”；这不是模型偶发越界，而是现有产品协议允许的行为。  
   建议：统一修改入口、提示词和输出 schema，只返回问题、缺口及定位；移除自动采用句子的路径。示范问题“帮我给理由想一个例子”改为“我的例子还缺什么信息？”

9. **[P1] 功能：提交改写稿后，尚未修改的错句反而从复习库消失。**  
   位置：[lib/learning/review-items.ts:25](/Users/chen/Desktop/opc/lib/learning/review-items.ts:25)、[lib/learning/review-items.ts:58](/Users/chen/Desktop/opc/lib/learning/review-items.ts:58)  
   现象：没有改写稿时收录问题句；有改写稿后，只保留能够匹配到不同句子的条目。离线验证中，仅补写其他句子，原来的主谓一致错句便从 1 条变成 0 条。已有复习进度也失去对应条目。  
   建议：问题句身份保持稳定；找不到改法时保留 `answer: null`，显示“尚未完成改写”，不要删除。

10. **[P1] 功能：复习评分重试会重复推进记忆间隔。**  
    位置：[components/review/review-deck.tsx:31](/Users/chen/Desktop/opc/components/review/review-deck.tsx:31)、[app/api/review/route.ts:27](/Users/chen/Desktop/opc/app/api/review/route.ts:27)  
    现象：服务器已保存“记住了”，但响应丢失；用户重试会再次升级。离线验证同一评分执行两次，间隔从 1 天变成 3 天，实际只复习了一次。  
    建议：为每次呈现的复习条目生成稳定评分请求 ID；重试复用该 ID，服务器记录回执并只推进一次。

11. **[P1] 交互：复习页承诺“回去和教练讨论”，已完成作文却无法继续讨论。**  
    位置：[components/review/review-deck.tsx:76](/Users/chen/Desktop/opc/components/review/review-deck.tsx:76)、[lib/learning/essay-view.ts:34](/Users/chen/Desktop/opc/lib/learning/essay-view.ts:34)、[lib/pipeline/engine.ts:42](/Users/chen/Desktop/opc/lib/pipeline/engine.ts:42)  
    现象：没有改法的复习条目引导返回作文；若作文已 `finished`，教练没有输入框，开始改写也只接受 `feedback` 阶段。用户到达目的页仍无法完成承诺的操作。  
    建议：增加明确的“复习这个问题”入口，带入问题上下文并进入受支持的讨论状态；无法支持时不要提供该承诺。

12. **[P1] 交互：速刷请求没有超时，连接悬挂时保存和操作会一直等待。**  
    位置：[components/quick/quick-screen.tsx:123](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:123)、[components/quick/quick-screen.tsx:137](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:137)  
    现象：保存请求一直不结束时，后续保存都等待 `inflight`，检查及写成作文也等同一请求；界面没有超时退出或可靠恢复入口。作文页已有超时处理，两页行为不一致。  
    建议：为读写设置超时；结果不确定时先查询状态，再复用原请求 ID 重试；提供“连接超时，内容仍在本页”。

13. **[P1] 交互：窄屏速刷教练发生错误时，错误和恢复按钮在抽屉背后。**  
    位置：[components/quick/quick-screen.tsx:311](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:311)、[components/quick/quick-screen.tsx:418](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:418)、[components/quick/quick-screen.tsx:461](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:461)  
    现象：小于 1280px 打开教练抽屉后，回答发送失败、前置保存失败等只设置主页面 `error`；抽屉内没有对应错误或重试按钮。用户看到发送停止，却不知道发生了什么。  
    建议：将相关错误放到抽屉输入区附近；共享作文页已有的面板内错误呈现方式。

14. **[P1] 交互：速刷自动保存失败后，没有真正的“重试保存”。**  
    位置：[components/quick/quick-screen.tsx:152](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:152)、[components/quick/quick-screen.tsx:240](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:240)、[components/quick/quick-screen.tsx:418](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:418)  
    现象：网络恢复后点击唯一的“刷新状态”，只会 GET 并清除错误，不会保存本地修改；相关 effect 的依赖可能完全不变，因此也不会重新触发自动保存。  
    建议：区分“重试保存”和“同步服务器状态”；前者明确执行保存，保存成功前持续保留失败状态。

15. **[P1] 功能：速刷修改后仍暂时显示旧检查结论为当前结论。**  
    位置：[components/quick/quick-screen.tsx:244](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:244)、[components/quick/quick-screen.tsx:405](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:405)、[components/quick/quick-screen.tsx:419](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:419)  
    现象：`passed` 和检查结果只看服务器卡片版本，不考虑本地 `dirty`。删掉已通过卡片的关键回答后，仍显示“题目问的都答到了”，主按钮仍是写成作文；保存失败时错误结论会长期保留。  
    建议：本地内容一变就将检查结论标为过期，显示“内容已修改，待检查”；继续写作文应明确按未检查内容处理。

16. **[P1] 功能：粘贴题目和普通模考创建缺少幂等保护。**  
    位置：[components/shell/new-essay.tsx:25](/Users/chen/Desktop/opc/components/shell/new-essay.tsx:25)、[app/api/sessions/route.ts:25](/Users/chen/Desktop/opc/app/api/sessions/route.ts:25)  
    现象：创建成功但响应丢失后，重试会新建另一份练习；题库创建已有幂等键，自由练习却没有。重复记录还会干扰“继续上次”和练习历史。  
    建议：所有创建入口使用稳定的创建意图 ID，服务端事务内记录回执；网络重试返回原练习。

17. **[P1] 交互：手机导航切换页面后，侧栏不会自动关闭。**  
    位置：[components/shell/app-sidebar.tsx:51](/Users/chen/Desktop/opc/components/shell/app-sidebar.tsx:51)、[components/ui/sidebar.tsx:70](/Users/chen/Desktop/opc/components/ui/sidebar.tsx:70)、[components/ui/sidebar.tsx:184](/Users/chen/Desktop/opc/components/ui/sidebar.tsx:184)  
    现象：移动端打开导航后，从练习切到复习或进展，布局中的 `openMobile` 继续为真；链接没有关闭侧栏，新页面仍被遮挡。  
    建议：导航链接成功触发站内跳转时调用 `setOpenMobile(false)`，并在路径变化后兜底关闭。

18. **[P1] 交互：小屏直接隐藏保存、字数和计时，丢掉写作必需信息。**  
    位置：[components/essay/essay-topbar.tsx:100](/Users/chen/Desktop/opc/components/essay/essay-topbar.tsx:100)、[components/quick/quick-screen.tsx:393](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:393)  
    现象：小于 640px 时，作文的字数、普通模考倒计时、保存状态全部隐藏；速刷的保存状态也隐藏。用户无法判断是否达到 250 词、还有多久、能否安全离开。  
    建议：窄屏增加紧凑状态行；至少常驻字数、模考时间及保存失败状态，不能通过隐藏来解决拥挤。

19. **[P1] 交互：检查点计时条放在整屏工作区外，页面高度超过视口。**  
    位置：[app/essays/[id]/page.tsx:24](/Users/chen/Desktop/opc/app/essays/[id]/page.tsx:24)、[components/checkpoints/clock.tsx:35](/Users/chen/Desktop/opc/components/checkpoints/clock.tsx:35)、[components/essay/essay-screen.tsx:151](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:151)  
    现象：计时条作为 `h-dvh` 工作区的前置兄弟节点，整体至少是“一屏＋计时条”，破坏固定工作区布局；后续反馈和教练底部可能落到视口外。**待确认：需实际检查桌面和手机上的双重滚动及底部可达性。**  
    建议：将计时条纳入同一个 `h-dvh flex-col` 容器，占据固定行，正文与面板共同使用剩余高度。

20. **[P1] 功能：“常见问题”的旧撤销按钮可能恢复其他已移除的问题。**  
    位置：[components/progress/issue-memory.tsx:25](/Users/chen/Desktop/opc/components/progress/issue-memory.tsx:25)、[components/progress/issue-memory.tsx:32](/Users/chen/Desktop/opc/components/progress/issue-memory.tsx:32)  
    现象：先移除 A，再移除 B，然后点击 A 的旧 toast“撤销”；回调捕获移除 A 前的 `excluded`，会把过期整数组写回，意外撤销 B 的移除。本地列表只更新 A，前后端进一步不一致。  
    建议：API 改为按单个 ID 增删；或回调通过最新状态引用计算，并用服务端返回值统一更新列表。

21. **[P1] 功能：按周数设置备考时间后，“还有几周”永远不减少。**  
    位置：[components/pages/onboarding-form.tsx:32](/Users/chen/Desktop/opc/components/pages/onboarding-form.tsx:32)、[lib/learning/summary.ts:44](/Users/chen/Desktop/opc/lib/learning/summary.ts:44)  
    现象：用户填写准备 8 周，系统只保存数字；首页和进展一直显示“还有 8 周”，没有起算日期。  
    建议：保存时转换为目标日期，或保存起算时间再计算剩余周数；若只表示计划长度，文案改成“计划备考 8 周”。

22. **[P1] 视觉：手机作文表把大部分宽度分给状态和分数，题目难以辨认。**  
    位置：[components/library/essay-table.tsx:52](/Users/chen/Desktop/opc/components/library/essay-table.tsx:52)、[app/(main)/layout.tsx:24](/Users/chen/Desktop/opc/app/(main)/layout.tsx:24)  
    现象：320px 视口扣除页面边距后约剩 280px，固定状态、分数、箭头列合计约 248px，题目列再扣内边距几乎没有文字空间。**待确认：实际裁切程度需浏览器核验。**  
    建议：小屏改成无卡片外框的纵向列表：题目独占第一行，状态、分数和日期放第二行。

23. **[P1] 交互：“全部卡片”实际只展示已通过检查的卡片。**  
    位置：[components/quick/quick-screen.tsx:402](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:402)、[app/(main)/cards/page.tsx:73](/Users/chen/Desktop/opc/app/(main)/cards/page.tsx:73)  
    现象：用户从未完成卡片点击“全部卡片”，到达页面默认过滤掉草稿，刚保存的内容不见了，容易误以为丢失。  
    建议：该入口使用 `/cards?tab=cards&drafts=true`；若保留当前过滤，则改名“已通过检查的卡片”。

24. **[P1] 交互：检查点入口加载失败会静默消失，没有重试入口。**  
    位置：[components/checkpoints/checkpoint-invitation.tsx:10](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:10)、[components/checkpoints/checkpoint-invitation.tsx:14](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:14)  
    现象：初始请求既不检查 `response.ok`，也没有 catch；网络失败或返回错误对象后，组件直接不显示，用户无法区分“未开放”和“加载失败”。  
    建议：区分加载、关闭、失败和成功状态；失败显示“模考信息暂时无法加载”及“重试”，不要伪装成没有入口。

25. **[P1] 文案：学习流程仍大量暴露检查点、基线和快照等内部概念。**  
    位置：[components/checkpoints/checkpoint-invitation.tsx:22](/Users/chen/Desktop/opc/components/checkpoints/checkpoint-invitation.tsx:22)、[components/essay/essay-topbar.tsx:158](/Users/chen/Desktop/opc/components/essay/essay-topbar.tsx:158)、[components/quick/card-readonly.tsx:30](/Users/chen/Desktop/opc/components/quick/card-readonly.tsx:30)  
    现象：用户会读到“不计入检查点基线或趋势”“结束当前检查点占位”“重新取得检查点资格”“主题卡片快照”，必须理解系统机制才能判断操作。  
    建议：对外统一叫“独立模考”；后果改为“本次仍会获得反馈，但不会加入成绩趋势”；“主题卡片快照”改为“开始写作时的卡片”。详细规则放按需展开。

26. **[P1] 视觉：多处重要次要文字仍低于明确要求的 14–15px。**  
    位置：[app/globals.css:54](/Users/chen/Desktop/opc/app/globals.css:54)、[components/auth/auth-form.tsx:33](/Users/chen/Desktop/opc/components/auth/auth-form.tsx:33)、[components/essay/compare-tab.tsx:65](/Users/chen/Desktop/opc/components/essay/compare-tab.tsx:65)、[components/pages/progress-charts.tsx:40](/Users/chen/Desktop/opc/components/pages/progress-charts.tsx:40)  
    现象：本项目 `text-xs` 实际为 13px，登录标签、账户标签、比较状态等仍广泛使用；图表轴文字为 SVG 11px，随 640 宽 viewBox 缩小后更小。  
    建议：标签、状态、操作文字最低 14px，正文说明 15px；图表减少刻度并按实际显示尺寸保证字号，不把整个 SVG 等比缩到不可读。

27. **[P1] 视觉：反馈和进展仍存在多层卡片嵌套。**  
    位置：[components/feedback/issue-list.tsx:63](/Users/chen/Desktop/opc/components/feedback/issue-list.tsx:63)、[components/feedback/issue-list.tsx:74](/Users/chen/Desktop/opc/components/feedback/issue-list.tsx:74)、[app/(main)/progress/page.tsx:56](/Users/chen/Desktop/opc/app/(main)/progress/page.tsx:56)、[app/(main)/progress/page.tsx:96](/Users/chen/Desktop/opc/app/(main)/progress/page.tsx:96)  
    现象：右侧面板里有问题边框卡，卡内再有蓝色圆角提示块；进展外层面板内又套虚线空状态框。窄面板被边框和内边距进一步压缩。  
    建议：问题按细线分隔，“改写方向”用蓝色标题或左线；空状态直接置于所在分区，去掉第二层容器。

28. **[P1] 视觉：问题编号和正文高亮额外引入黄、粉、绿三种强调。**  
    位置：[components/essay/essay-reader.tsx:8](/Users/chen/Desktop/opc/components/essay/essay-reader.tsx:8)、[components/feedback/issue-list.tsx:13](/Users/chen/Desktop/opc/components/feedback/issue-list.tsx:13)、[app/globals.css:115](/Users/chen/Desktop/opc/app/globals.css:115)  
    现象：颜色按问题序号循环，并不表达警告、错误或成功状态；同一写作页形成墨、蓝、黄、粉、绿的多套视觉强调，偏离双强调色要求。  
    建议：问题使用统一蓝色编号与浅蓝标注，通过编号、下划线和选中深浅区分；状态色仅用于真正的结果或风险。

29. **[P2] 交互：退出登录失败被静默吞掉。**  
    位置：[components/shell/app-sidebar.tsx:72](/Users/chen/Desktop/opc/components/shell/app-sidebar.tsx:72)  
    现象：网络失败或服务器拒绝退出时，只重置 `busy`；菜单已经关闭，用户可能误以为退出完成。  
    建议：显示持久 toast：“退出失败，你仍处于登录状态”，附“重试”。

30. **[P2] 交互：速刷教练无条件滚到底部，打断阅读和摘取回答。**  
    位置：[components/quick/quick-screen.tsx:292](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:292)、[components/essay/coach-tab.tsx:60](/Users/chen/Desktop/opc/components/essay/coach-tab.tsx:60)  
    现象：用户向上查看旧回答时，只要消息、忙碌状态或待回答状态变化，速刷就强制滚到底部；作文页已经有“接近底部才跟随”的保护。  
    建议：复用作文页的跟随条件，离开底部时显示“有新消息”；同时遵守减少动态效果偏好。

31. **[P2] 无障碍：作文面板标签没有对应的语义面板。**  
    位置：[components/essay/essay-screen.tsx:134](/Users/chen/Desktop/opc/components/essay/essay-screen.tsx:134)、[components/library/essay-table.tsx:42](/Users/chen/Desktop/opc/components/library/essay-table.tsx:42)  
    现象：使用 `TabsTrigger`，内容却放普通 `div` 或整个 `Tabs` 外，未使用 `TabsContent`，缺少完整的 tab／tabpanel 关联。视觉切换可用，但读屏无法可靠关联标签与内容区域。  
    建议：真正的页签使用对应 `TabsContent value`；作文列表若只是过滤器，改为有选中状态的按钮组。

32. **[P2] 无障碍：教练回答没有到达播报，读屏只知道“正在思考”。**  
    位置：[components/coach/coach-thread.tsx:55](/Users/chen/Desktop/opc/components/coach/coach-thread.tsx:55)、[components/quick/quick-screen.tsx:318](/Users/chen/Desktop/opc/components/quick/quick-screen.tsx:318)  
    现象：忙碌点有 `role="status"`，实际消息列表却没有 live region；焦点留在输入框时，新回答到达没有明确通知。  
    建议：消息区采用合适的 `role="log"`／`aria-live="polite"`，只播报新增消息；长回答可先播报“教练已回复”，提供跳到回复的入口，避免重读整个历史。

优先 1：修复速刷冲突合并与作文错误快照重试，阻止覆盖和保存卡死。  
优先 2：把提纲、未发送及失败消息统一纳入保存、离开保护和完整备份。  
优先 3：恢复手机端版本切换、关键状态和抽屉内错误恢复。  
优先 4：按“只提问、指出缺口”收紧教练输出协议及采用句子的入口。  
优先 5：保留未解决错句，并为复习评分增加幂等保护。