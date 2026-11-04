import type { CardContent, CardSnapshot } from "@/lib/quick/schemas";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import { layoutFields } from "@/lib/quick/layouts";

export function CardReadonly({ content, title = "主题卡片", requirements }: { content: CardContent; title?: string; requirements?: QuestionRequirements }) {
  const keys = [...new Set(content.parts.map(part => part.key.slice(0, part.key.lastIndexOf("."))))];
  const groups = requirements?.subquestions ?? keys.map((key, index) => ({ key, zh: `问题 ${index + 1}`, en: "" }));
  return <section aria-label={title} className="paper mb-6 space-y-4 px-6 py-5">
    <h2 className="text-[15px] font-semibold">{title}</h2>
    {content.parts.length === 0 && <p className="text-xs text-muted-foreground">这份卡片还没有内容。</p>}
    {groups.map((group, index) => <div key={group.key} className="space-y-3 border-t pt-3" role="group" aria-label={`问题 ${index + 1}：${group.zh}`}>
      <div><h3 className="text-sm font-medium">{requirements ? `${index + 1}. ${group.zh}` : group.zh}</h3>{group.en && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{group.en}</p>}</div>
      {content.parts.filter(part => part.key.startsWith(`${group.key}.`)).map(part => <div key={part.key}>
        <h4 className="mb-1 text-xs text-muted-foreground">{layoutFields[content.layout].find(f => part.key.endsWith(`.${f.key}`))?.label ?? "材料"}<span className="ml-1.5 text-faint">{part.provenance.kind === "excerpt" ? "摘自你的回答" : "你的输入"}</span></h4>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{part.text}</p>
      </div>)}
      {content.parts.every(part => !part.key.startsWith(`${group.key}.`)) && <p className="text-xs text-muted-foreground">这个问题还没有填写材料。</p>}
    </div>)}
  </section>;
}
export function CardSnapshotView({ snapshot, requirements }: { snapshot: CardSnapshot; requirements?: QuestionRequirements }) {
  return <div><p className="mb-2 text-xs text-muted-foreground">写成作文时保存的卡片，只读。</p><CardReadonly content={snapshot.content} title="主题卡片快照" requirements={requirements} /></div>;
}
