import Link from "next/link";
import type { AttemptView, CompletionView } from "@/lib/rules/recommend";
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function timestamp(date: string) { return Number.isFinite(Date.parse(date)) ? dateFormat.format(new Date(date)) : "时间未知"; }
export function AttemptHistory({ attempts, completions }: { attempts: AttemptView[]; completions: CompletionView[] }) {
  if (!attempts.length) return null;
  return <div className="space-y-2"><h3 className="text-[14px] font-medium text-muted-foreground">练习历史（台北时间）</h3><ul className="space-y-2.5">{attempts.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)).map(a => {
    const completedAt = completions.find(c=>c.attemptId===a.id)?.completedAt;
    return <li key={a.id}><Link className="text-sm font-medium underline decoration-input underline-offset-4 hover:decoration-foreground" href={`/essays/${a.id}`}>{a.activity === "quick" ? "速刷" : "精练"} · {a.completed ? "已完成" : a.lifecycle === "set_aside" ? "已暂放" : a.lifecycle === "closed" ? "已关闭" : "进行中"}{a.cardState === "unchecked" ? " · 待复查" : ""}<span className="ml-2 font-normal text-muted-foreground">开始于 <time dateTime={a.createdAt}>{timestamp(a.createdAt)}</time></span></Link>
      <p className="mt-1 text-[14px] text-muted-foreground">{a.completed ? completedAt ? <>完成于 <time dateTime={completedAt}>{timestamp(completedAt)}</time></> : "历史完成时间未知" : a.lastStudentActionAt ? <>最后编辑 <time dateTime={a.lastStudentActionAt}>{timestamp(a.lastStudentActionAt)}</time></> : "尚无编辑记录"}</p></li>;
  })}</ul></div>;
}
