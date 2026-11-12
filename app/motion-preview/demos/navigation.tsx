"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { BarChart3, BookOpen, ChevronDown, FileText, MessageSquare, MoreHorizontal, PanelLeft, PanelRight, Plus } from "lucide-react";
import { MotionButton, MotionCollapse, MotionDialog, MotionDialogClose, MotionDialogContent, MotionDialogTrigger, MotionDisclosure, MotionMenuContent, MotionNotice, MotionPopoverContent, MotionSwap, MotionTabs, MotionTooltipContent, useMotionSettings } from "@/components/motion";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import s from "../preview.module.css";

export function TabsDemo() {
  const [value, setValue] = useState("feedback");
  return <div className={s.stack}><MotionTabs label="检查面板预览" value={value} onChange={setValue} items={[
    { value: "feedback", label: "反馈", content: <div className={s.tabContent}><span className={s.paperLabel}>先关注一件事</span><h4>把论点和例子连接起来</h4><p>补充一句解释，告诉读者这个例子如何支持你的观点。</p></div> },
    { value: "coach", label: "教练", content: <div className={s.tabContent}><span className={s.coachLabel}><span>0</span>教练</span><h4>从你的原话出发</h4><p>保留原本的想法，我们一起找到更准确的表达。</p></div> },
    { value: "compare", label: "对比", content: <div className={s.tabContent}><span className={s.paperLabel}>原稿 → 改写稿</span><h4>看看这次具体改进了什么</h4><p>例子更具体，段落之间的联系也更清楚了。</p></div> },
  ]} /><p className={s.hint}>选中项平滑移动；内容淡入，正文不缩放。支持方向键。</p></div>;
}

export function SidebarDemo() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("作文");
  const { transition } = useMotionSettings();
  return <div className={s.stack}><div className={s.splitLine}><span>工作区</span><MotionButton variant="ghost" size="icon-sm" aria-label="切换侧栏预览" aria-expanded={open} aria-controls="preview-sidebar" onClick={() => setOpen(!open)}><PanelLeft size={16} /></MotionButton></div>
    <div className={s.workspace}><motion.aside id="preview-sidebar" className={s.miniSidebar} animate={{ width: open ? 126 : 43 }} transition={transition("layout")}>
      {([{ label: "作文", icon: FileText }, { label: "进展", icon: BarChart3 }, { label: "卡片", icon: BookOpen }]).map(item => <button key={item.label} type="button" aria-label={item.label} aria-pressed={active === item.label} onClick={() => setActive(item.label)}><item.icon size={16} /><span hidden={!open}>{item.label}</span></button>)}
    </motion.aside><div className={s.workspaceBody}><MotionSwap value={active}><span className={s.paperLabel}>{active}</span><div className={s.tinyPaper}><span className={s.essay}>A quiet place<br />to think.</span></div></MotionSwap></div></div><p className={s.hint}>收起导航，保留图标与焦点，纸面文字不被拉伸。</p></div>;
}

export function DisclosureDemo() {
  return <div><MotionDisclosure title="评分依据"><p>任务回应完整，论点可以进一步展开。补充具体例子会让支撑更有说服力。</p></MotionDisclosure><MotionDisclosure title="查看其他两个问题"><p>关注代词指代，以及第二段末尾的衔接。</p></MotionDisclosure><MotionDisclosure title="这次练习的原话来源"><p>例子来自你在写前梳理时记录的课堂经历。</p></MotionDisclosure><p className={s.hint}>高度随内容展开，箭头与内容同步。关闭后隐藏内容不可聚焦。</p></div>;
}

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return <div className={s.centerDemo}><span className={s.largeIcon}><Plus size={23} /></span><h4>新建练习与离开确认</h4><p className={s.muted}>浮层轻微进入，遮罩只降低背景干扰。</p><MotionDialog open={open} onOpenChange={setOpen}><MotionDialogTrigger render={<MotionButton variant="outline" />}>预览确认弹窗</MotionDialogTrigger><MotionDialogContent title="暂放这次练习？" description="当前草稿会保留。这个弹窗仅演示确认交互，不会修改真实练习。"><div className={s.inset}><FileText size={17} /><span>Technology in the classroom</span></div><div className={s.dialogActions}><MotionDialogClose render={<MotionButton variant="ghost" />}>继续编辑</MotionDialogClose><MotionButton onClick={() => { setConfirmed(true); setOpen(false); }}>确认暂放</MotionButton></div></MotionDialogContent></MotionDialog><p className={s.statusLine} role="status">{confirmed ? "已确认演示。焦点已回到触发按钮。" : "支持 Esc、点击遮罩和焦点返回。"}</p></div>;
}

export function DrawerDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("outline");
  return <div className={s.centerDemo}><span className={s.largeIcon}><PanelRight size={23} /></span><h4>窄屏中的提纲与教练</h4><p className={s.muted}>侧面进入，保留它与正文的空间关系。</p><MotionDialog open={open} onOpenChange={setOpen}><MotionDialogTrigger render={<MotionButton variant="outline" />}>预览侧边抽屉</MotionDialogTrigger><MotionDialogContent drawer title="写作面板" description="在手机上查看提纲与反馈，关闭后继续阅读原文。"><MotionTabs value={value} onChange={setValue} label="抽屉内容" items={[{ value: "outline", label: "提纲", content: <div className={s.stack}><MotionDisclosure title="引言" defaultOpen>明确立场：科技应辅助教师，而不是取代他们。</MotionDisclosure><MotionDisclosure title="主体段">具体例子 → 解释例子 → 回扣观点。</MotionDisclosure><MotionDisclosure title="结尾">总结论证，回到题目。</MotionDisclosure></div> }, { value: "coach", label: "教练", content: <div className={s.coachBox}><div className={s.coachLabel}><span>0</span>教练</div><p>你的立场已经很清楚了。我们先把第一个例子写具体。</p></div> }]} /></MotionDialogContent></MotionDialog><p className={s.hint}>支持 Esc 关闭，Tab 焦点限制在抽屉内。</p></div>;
}

export function MenusDemo() {
  const [action, setAction] = useState("");
  const [popover, setPopover] = useState(false);
  return <div className={s.stack}><div className={s.toolbarExample}><span className={s.paperLabel}><FileText size={15} />练习工具栏</span><div className={s.actions}>
    <Tooltip><TooltipTrigger render={<MotionButton variant="ghost" size="icon-sm" aria-label="工具提示示例" />}><MessageSquare size={17} /></TooltipTrigger><MotionTooltipContent>和教练讨论</MotionTooltipContent></Tooltip>
    <DropdownMenu><DropdownMenuTrigger render={<MotionButton variant="ghost" size="icon-sm" aria-label="更多操作预览" />}><MoreHorizontal size={18} /></DropdownMenuTrigger><MotionMenuContent className="w-44"><DropdownMenuItem onClick={() => setAction("已演示「下载作文」反馈。")}>下载作文</DropdownMenuItem><DropdownMenuItem onClick={() => setAction("已演示「保存并暂放」反馈。")}>保存并暂放</DropdownMenuItem></MotionMenuContent></DropdownMenu>
  </div></div><div className={s.inset}><p>悬停对话图标查看提示，或打开更多菜单。</p></div>
    <Popover open={popover} onOpenChange={setPopover}><PopoverTrigger render={<MotionButton size="sm" variant="outline" />}>预览提交确认<ChevronDown size={14} /></PopoverTrigger><MotionPopoverContent align="start"><p className={s.muted}>提交后，本稿将进入评估。这里只演示交互。</p><div className={s.actions}><MotionButton size="sm" variant="ghost" onClick={() => setPopover(false)}>再看看</MotionButton><MotionButton size="sm" onClick={() => { setAction("已确认提交演示。"); setPopover(false); }}>确认</MotionButton></div></MotionPopoverContent></Popover>
    <MotionCollapse open={!!action} id="menu-demo-result"><MotionNotice>{action}</MotionNotice></MotionCollapse>
  </div>;
}
