import type { CardContent, CardSnapshot } from "@/lib/quick/schemas";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import { layoutFields } from "@/lib/quick/layouts";
import { cn } from "@/lib/utils";

/** 只读的主题卡片。plain：列表里直接摊开，不套纸面、不重复标题 */
export function CardReadonly({ content, title = "主题卡片", requirements, plain = false }: { content: CardContent; title?: string; requirements?: QuestionRequirements; plain?: boolean }) {
  const keys = [...new Set(content.parts.map(part => part.key.slice(0, part.key.lastIndexOf("."))))];
  const groups = requirements?.subquestions ?? keys.map((key, index) => ({ key, zh: `问题 ${index + 1}`, en: "" }));
  const single = groups.length === 1;
  return <section aria-label={title} className={plain ? "mt-5 space-y-6" : "paper mb-6 space-y-4 px-6 py-5"}>
    {!plain && <h2 className="text-[15px] font-semibold">{title}</h2>}
    {content.parts.length === 0 && <p className="text-[14px] text-muted-foreground">这份卡片还没有内容。</p>}
    {groups.map((group, index) => {
      const parts = content.parts.filter(part => part.key.startsWith(`${group.key}.`));
      return <div key={group.key} className={cn("space-y-3", !plain && "border-t pt-3")} role="group" aria-label={`问题 ${index + 1}：${group.zh}`}>
        {!(plain && single) && <div><h3 className="text-sm font-medium">{requirements ? `${index + 1}. ${group.zh}` : group.zh}</h3>{group.en && !plain && <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{group.en}</p>}</div>}
        <div className={cn(plain && "grid gap-x-10 gap-y-4 sm:grid-cols-2")}>
          {parts.map(part => <div key={part.key} className={cn(!plain && "mt-3 first:mt-0")}>
            <h4 className="mb-1 text-[14px] text-muted-foreground">{layoutFields[content.layout].find(f => part.key.endsWith(`.${f.key}`))?.label ?? "材料"}{!plain && <span className="ml-2 text-faint">{part.provenance.kind === "excerpt" ? "摘自你的回答" : "你的输入"}</span>}</h4>
            <p className={cn("whitespace-pre-wrap break-words leading-relaxed", plain ? "text-[16px]" : "text-sm")}>{part.text}</p>
          </div>)}
        </div>
        {parts.length === 0 && content.parts.length > 0 && <p className="text-[14px] text-muted-foreground">这个问题还没有填写。</p>}
      </div>;
    })}
  </section>;
}
export function CardSnapshotView({ snapshot, requirements }: { snapshot: CardSnapshot; requirements?: QuestionRequirements }) {
  return <CardReadonly content={snapshot.content} title="开始写作时的卡片" requirements={requirements} />;
}
