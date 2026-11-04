# project 0 宣传页 v4

- **Created:** 2026-11-04｜**Status:** 视觉稿 v4，待 owner 确认。
- **视觉稿：** [mockups/landing-v4.html](mockups/landing-v4.html)（单文件，约 900 KB，字体和图片已内嵌）。默认英文，右上角可切换中文；也可以在地址后加 `?lang=zh` 直接打开中文版。
- **与前几版的关系：** v3（[landing_page_v3.md](landing_page_v3.md)、[mockups/landing-v3.html](mockups/landing-v3.html)）是 auglearn 品牌页，已作为备份保留。v4 回到 **project 0 产品页**，auglearn 只出现在页脚。[v2](landing_page_v2.md) §6 列出的“不能说的话”继续有效。

## 1. 方向

| 项 | 决定 |
|---|---|
| 主角 | project 0 这个产品，不是 auglearn |
| 视觉 | 参考 Devin 的简约、清新的科技美学：白底、近黑文字、黑色胶囊按钮、大块圆角面板，产品界面浮在照片之上 |
| 首屏动效 | 直接沿用 `/motion-preview` 里的 “Mix · 人文与晴空” 图片流（见 §3）。全页只有这一处会自动播放 |
| 功能介绍 | 参考 clawsgo.ai 的做法：先用一条时间线讲完一道题的完整流程，再用大面板逐个展示功能，每个面板都放一段可以操作的产品界面 |
| 字体的分工 | 界面和标题用 Geist。学生写的字（作文、回答、卡片）一律用 Newsreader，与产品内保持一致 |

## 2. 页面结构

| # | 分区 | 内容 |
|---|---|---|
| 1 | 导航 | project 0 标识；Approach / How it works / Features / Pricing；**语言切换（EN / 中文）在 Log in 左侧**；Join the beta |
| 2 | 首屏 | 内测标签；主标题 “The AI writing tutor that starts with your ideas”；一句说明；两个按钮 |
| 3 | 图片流与产品窗口 | 写作界面浮在图片流上：左侧是步骤和提纲，中间是作文纸面，右侧是教练对话和一条语法建议。右下角可以暂停背景 |
| 4 | 理念 | “A tutor, not an answer machine”。三张卡片各带一小段界面：从你的想法出发 / 先追问再给答案 / 它记得你 |
| 5 | 一道题，从头到尾 | 五步时间线（0:00 选题 → 0:02 写前梳理 → 0:10 写作 → 0:50 评分 → 第二天改写）。每一步右侧是一段运行记录；左侧竖线随滚动填充 |
| 6 | 功能 | 四个大面板，照片底图上放可操作的界面：建议引用原话（点“采用”后写进正文，可撤销）、评分与辅导隔离（悬停问题，对应句子会高亮）、逐稿对比（切换第一稿和第二稿）、看得见的记忆（点“忘掉”后移除，可撤销）。下面是三张小卡：题库与推荐、速刷卡片、模考检查点 |
| 7 | 智能档位与定价 | Adept / Mentor（默认）/ Sage，标“即将推出”；credit 用量条；“评分方式始终不变” |
| 8 | 边界 | 四条：分数为 AI 预估；不给范文；记忆可查、可改、可删；删除账户即删除作文 |
| 9 | 结尾 | “Your next essay starts with your own idea”，背景是一张照片 |
| 10 | 页脚 | “The first product from auglearn.org”；隐私、条款、联系我们 |

## 3. 首屏图片流

- **来源：** [app/motion-preview/demos/theme-compare.tsx](../../app/motion-preview/demos/theme-compare.tsx) 的 Mix 版本：13 张图，每张只出现一次（9 张人文、4 张玻璃与天空）。
- **几何与节奏：** 槽位、尺寸、纵向位置、时长和延迟都取自 [devin-source.json](../../app/motion-preview/demos/devin-source.json)。运动轨道为 `max(100vw, 1900px) + 260px`，线性无限循环；远层模糊 6px、透明度 0.6；图片使用 `multiply` 混合和 `saturate(.42) contrast(.86) brightness(1.12)` 调色，与预览页一致。
- **嵌入方式：** 视觉稿里的图片是从 `public/motion-preview/themes/` 缩小后内嵌的（最长边 540px）。正式实现时应直接复用 `useDevinMotion`，并按 [public/motion-preview/themes/README.md](../../public/motion-preview/themes/README.md) 保留 Unsplash 来源。
- **暂停：** 离开视口或切到后台标签页时暂停；系统开启“减少动态效果”时保持静止，并隐藏暂停按钮。

## 4. 视觉规范

| 名称 | 值 | 用途 |
|---|---|---|
| Paper | `#FFFFFF` | 页面底色 |
| Mist | `#F5F6F7` | 卡片、语言切换 |
| Ink | `#15171A` | 文字、主按钮 |
| Ink-2 | `#50565F` | 唯一的次要文字颜色，最小 15px |
| Line | `#E6E8EB` | 分隔线、描边 |
| Coach | `#2F4FA8` | 产品主色：教练、建议、时间线进度、默认档位 |

产品界面里的颜色（桌面 `#ECEEF1`、问题高亮 hl-1/2/3、`good` 绿）取自 [app/globals.css](../../app/globals.css)，保证宣传页里的界面和真实产品一致。

| 层级 | 英文 | 中文 |
|---|---|---|
| 首屏标题 | 42–76px，字重 500，字距 -0.042em | 字距 -0.02em，行高 1.14 |
| 章节标题 | 34–52px，字距 -0.036em | 字距 -0.012em，行高 1.2 |
| 面板标题 | 26–34px | 字距 0 |
| 正文 | 17–20px，行高 1.55 | 行高 1.7 |

没有使用全大写眉题、等宽小标签、按钮箭头或逐节淡入。只有时间线是带编号的序列。

## 5. 中英双语

与 v3 规则相同：默认英文，不按浏览器语言自动切换；选择记在 `localStorage`（键名改为 `project0.lang`）；URL 里的 `?lang=` 优先。作文、题目和例句在两种语言下都保持英文，因为这就是产品的真实输出。正式实现建议放在 `app/[lang]/` 路由下，文案放在字典文件中。

## 6. 写在页面上的说法与依据

| 页面说法 | 依据 |
|---|---|
| 先追问、再指方向、最后才示范 | 原型 00 总览 §1“引导先于给答案” |
| 建议引用原话，点“采用”才写入 | 00 总览 §1“用户的思路优先”“最小修改” |
| 评分看不到对话和记忆；练习分和模考分分开 | 00 总览 §1“分数可信”、§4 |
| 记忆可查看、修改、删除 | 00 总览 §1“记忆透明” |
| 主题题库、推荐理由、速刷卡片、40 分钟检查点 | 0.4 改版（README、原型 12、13） |
| 卡片只保存学生自己写的字 | 00 总览 §1“卡片是你写的” |
| 档位“即将推出”；选择档位不影响评分 | [tutor_style_tiers.md](tutor_style_tiers.md) §7、§8 |
| 价格上线前公布，不写数字 | v2 §6 |

时间线和界面里的分数、字数、用时都是示例数据，不是产品实测结果。

## 7. 待 owner 决定

1. 主标题用 “The AI writing tutor that starts with your ideas” 吗？备选：“Meet project 0, the writing tutor that thinks with you.”
2. 功能区四个大面板的顺序：现在是建议、评分、对比、记忆。要不要把记忆提到第一个？
3. 定价区要不要在内测阶段就展示？目前档位和价格都还没有上线。
