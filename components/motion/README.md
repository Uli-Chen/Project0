# 前端动效组件（预览阶段）

本目录尚未被业务页面引用；唯一使用方是 `/motion-preview`。本轮不修改现有 `components/ui`、业务组件、全局样式或路由导航。

视觉基准：当前前端的桌面 / 面板 / 纸张设计（`8050dce`、`3608da5`），直接使用 `app/globals.css` 的语义颜色、阴影、Geist / Newsreader 字体，以及现有 Button / Base UI。站内风格场景不增加独立品牌配色。另有 Devin 原版背景参考区，保留原站图片与浅色底，仅用于本地对照。

## 文件

- `tokens.ts`：唯一的时间、曲线、位移与错峰值。
- `provider.tsx`：统一系统减少动态效果、预览慢放和循环暂停；导出 CSS 变量供 Portal 使用。
- `primitives.tsx`：无业务依赖的受控显示组件。没有 fetch、数据库读写、模拟延时或持久化。
- `overlays.tsx`：Base UI 弹窗 / 抽屉，以及原菜单 / Popover / Tooltip 的 Content 包装。
- `motion.module.css`：局部样式，只有导入组件才生效。
- `../../app/motion-preview/catalog.ts`：25 组场景、业务目标路径、迁移注意事项、可复制用法片段。
- `../../app/motion-preview/demos`：演示状态与模拟请求，不能复制到生产业务逻辑。

## 规范

| 场景 | 时间 | 动作 |
| --- | --- | --- |
| 按压 / 高频提示 | 120 ms | 轻按 0.98，颜色和边框回应 |
| 状态 / 内容切换 | 180 ms | 淡入；正文不缩放、不逐字播放 |
| 布局 / 折叠 / Tab | 240 ms | 容器高度或位置变化，无过冲 |
| 图标 / 勾号 / 数据条 | 320 ms | 单次完成，不反复装饰 |
| 等待循环 | 1.8 s | 低幅度透明度变化 / 匀速旋转 |
| 进入位移 | 4 px | 只在必要的新增内容处使用 |

错峰为 35 ms，最多累计 175 ms。慢放仅改变动画时间，不改变网络状态或真实等待时间。

减少动态效果优先于预览设置：所有 JS 过渡时长归零、布局动画关闭、CSS 循环停用，Portal 也接收同样的设置。状态、文本、焦点和可操作性都保留。循环暂停不阻止点击反馈。

不建议给持续输入的正文、每秒倒计时、历史消息、整个页面导航添加动画。不要用倒数或伪百分比假装网络请求有已知进度。

## 接入方式

在选定的客户端交互区域引入 Provider；不必把服务器页面整体改成客户端组件：

```tsx
"use client";
import { MotionProvider } from "@/components/motion";

export function AnimatedFeature({ children }: { children: React.ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
```

按组件逐项接入，保留原请求、校验、锁定、可访问性与业务状态。生产端使用默认配置；不传预览的 `slow` / `paused`。

```tsx
import { MotionAction, type AsyncStatus } from "@/components/motion";

// 在现有保存组件中映射状态；不要增加额外请求或延时。
const status: AsyncStatus = saveStatus === "saving" ? "pending"
  : saveStatus === "saved" ? "success"
  : saveStatus === "error" ? "error" : "idle";

<MotionAction
  status={status}
  disabled={lifecycleBusy}
  className="min-w-32"
  onClick={() => void actions.save()}
>
  保存草稿
</MotionAction>
```

## 迁移边界

- `MotionTabs` 的内容切换会卸载旧内容。只读面板可直接使用；含编辑器、表单或独立滚动位置的面板保留原 Base UI Tabs 的挂载策略，只迁移指示器和淡入。不要给整个编辑器添加变化的 key。
- `MotionSwap` 会重建内部树，适合状态标签、只读内容及短操作区，不包住输入框。注意操作区切换后的焦点恢复。
- `MotionList` / `MotionListItem` 是 `ul/li`，不直接放入 `table/tbody`。表格迁移使用同样 token 的 `motion.tr` 并保持表格语义。条目使用业务 ID；被移除条目在退出期间会 inert。
- `MotionCollapse` 保留 DOM，关闭时立即 aria-hidden / inert。调用方若从内部关闭，应将焦点移回触发按钮。`id` 必须唯一。
- 弹窗 / 抽屉基于 Base UI Dialog 的焦点管理，使用 Trigger 绑定触发按钮，保留取消、Esc 和焦点返回。这里只提供侧边抽屉，不实现手势拖拽。
- `MotionMenuContent`、`MotionPopoverContent`、`MotionTooltipContent` 仅替换现有 Content，沿用原 Root/Trigger 和业务回调。CSS starting/ending-style 过渡可中途反向。
- 当前生产 Toast 继续由 Sonner 管理。`MotionNotice` 是页面内状态提示，不替换其队列、播报或手势。
- `MotionMeter` 必须接收真实、有限数值与正数 max。分数不从零滚动，耗时未知的网络请求不使用确定进度条。
- `MotionReveal` 用于新增内容：稳定 key；不要在每次 token 更新时重新挂载。历史结果应直接呈现。
- 现有 `<Link>`、表单、Switch、Segmented 的语义和样式保持；预览 Provider 内只统一其 CSS 过渡时间。

## 已覆盖场景与目标

完整映射以预览卡片的「接入说明」和 `app/motion-preview/catalog.ts` 为准：

| 分类 | 场景 |
| --- | --- |
| 背景氛围（3） | 人文 / 科技双版本对比、Devin 原版图片流、网站风格写作素材流；均支持速度 / 密度 / 模糊度调节 |
| 基础反馈（5） | AI/按钮加载，保存/失败重试，动态图标，状态提示，骨架屏 |
| 导航与浮层（6） | Tab，侧栏，折叠，Dialog，Sheet，菜单/Popover/Tooltip |
| 写作与教练（5） | 思考到回复，选区/引用，建议采用/忽略/撤销，问题联动高亮，版本/差异 |
| 练习与数据（6） | 列表/筛选/空状态，评分条，评估/问卷步骤，主题卡片，选项/开关/校验，完成/周进展 |

## 验证

```sh
npx eslint app/motion-preview components/motion --max-warnings=0
npm run typecheck
```

浏览器重点验证：正常/慢放/减少动态效果；快速开合浮层；Esc 与焦点返回；Tab 方向键；表单错误；建议撤销；列表空状态；筛选期间清理模拟请求；窄屏无横向溢出。下一步正式接入时，针对被修改业务重新运行其原有回归测试。

## 背景图片流（新增）

`MotionCollage` 仅在预览页使用。参考 Devin 的左右穿行与双层景深，素材全部为原创 DOM / SVG 虚构写作材料，不下载或复用其图片。

- `items: ReactNode[]`：纯装饰素材；外层 aria-hidden / inert，不放交互控件、重复 ID 或真实用户数据。
- `speed`：0.25–3 倍（默认 1）；与 Provider 的慢放相乘。
- `density`：8–32 张（默认 20）；代表整个轨道中的素材数，部分在视口之外。
- `blur`：远层 0–10 px（默认 4）；近层采用其 12%，保留层次。
- `paused`：局部暂停，与 Provider 暂停和系统减少动态共同生效。

父容器须有高度和 `position: relative`，组件为绝对定位背景。推荐介绍区，而非正在编辑的工作区。素材渲染及前景示例位于 `app/motion-preview/demos/collage.tsx`；仅将合适的展示素材传给通用组件。

使用浏览器原生 Web Animations API，仅动画化 transform；`updatePlaybackRate` 保持调速时的播放位置，不重新启动循环。ResizeObserver 更新跨越距离并保留时间进度，IntersectionObserver / visibilitychange 在离屏和后台暂停；卸载时销毁动画、观察器与监听器。减少动态时保留静态构图；无逐帧 React 更新、无外部素材请求、无新增依赖。

API 依据：[Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)、[Animation.updatePlaybackRate](https://developer.mozilla.org/en-US/docs/Web/API/Animation/updatePlaybackRate)。

## Devin 原版背景参考

`app/motion-preview/demos/devin.tsx` 使用原站公开的 18 张 WebP，在两层共 32 个图片位置复用。原始尺寸、纵向位置、循环时长与延迟见 `devin-source.json`。图片及来源清单位于 `public/motion-preview/devin`。保留原站 1900px 最小运动轨道、260px 起始偏移、线性循环、multiply 混合、远层 0.6 透明度和 6px 模糊。容器改为预览页内 620px 高展示区域，省略产品前景与首屏加载淡入，以直接观察背景；不是嵌入原网页。此场景未导出到通用组件库，未接入正式网站。

## 人文 / 科技双版本素材对比

`app/motion-preview/demos/theme-compare.tsx` 与 Devin 原版示例共用 `devin-source.json` 和 `use-devin-motion.ts`：两版保持相同的 32 个位置、尺寸、延迟及运动速度，切换不重启动画。左右对照裁切完整画布，不缩小或重新排版图片。分界支持拖动、方向键和 Home / End。

A 使用图书馆、书页、雕塑与博物馆照片，B 使用玻璃立面、金属结构、射电天线与风力设施；统一以 CSS 降低饱和度、柔化对比，保留原始图片。素材清单和来源在 `theme-assets.json` 以及 `public/motion-preview/themes/README.md`。

仅在 `/motion-preview` 装载；正式页面无引用。后续迁移可复用 hook、布局 JSON 和所选素材映射，按目标容器调整高度。当前保留 Devin 的视口宽度运动轨道，若嵌入更窄业务容器，应另行确认轨道宽度。离屏、全局暂停、减少动态效果均会暂停播放；两版共享控件。

### 混合版（默认，32 张）

Mix 与「Devin 原图」共用同一组 `DevinLayers` 图片节点；切换时保留播放进度和暂停状态。`devin-source.json` 决定 32 个位置的宽高、纵向位置、循环时间和延迟。远景 16 张默认透明度 0.6、模糊 6px，近景 16 张在 Mix 中以 76% 不透明度呈现，原图为 100%；两层上下各延伸 60px。Mix 不额外叠加调色滤镜。

换图只需在 `mixed-slots.json` 按远景、近景顺序指定素材 ID。当前使用 22 张照片和 10 张馆藏建筑图稿，32 张互不重复。素材路径与来源见同目录的 `theme-assets.json` 和 `mixed-extra-assets.json`。预览页可暂停后切换版本，查看同一帧的选图与裁切。
