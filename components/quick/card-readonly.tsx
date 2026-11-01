import type { CardContent, CardSnapshot } from "@/lib/quick/schemas";
import { layoutFields } from "@/lib/quick/layouts";

export function CardReadonly({ content, title = "主题卡片" }: { content: CardContent; title?: string }) {
  return <section aria-label={title} className="mb-6 space-y-3 rounded-lg border bg-sheet p-4">
    <h2 className="text-sm font-medium">{title}</h2>
    {content.parts.length === 0 && <p className="text-xs text-muted-foreground">这份卡片还没有内容。</p>}
    {content.parts.map((part, index) => <div key={part.key}>
      <h3 className="mb-1 text-xs text-muted-foreground">{index + 1}. {layoutFields[content.layout].find(f => part.key.endsWith(`.${f.key}`))?.label ?? "材料"} · {part.provenance.kind === "excerpt" ? "摘自你的回答" : "你的输入"}</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{part.text}</p>
    </div>)}
  </section>;
}
export function CardSnapshotView({ snapshot }: { snapshot: CardSnapshot }) {
  return <div><p className="mb-2 text-xs text-muted-foreground">写成作文时保存的卡片，只读。</p><CardReadonly content={snapshot.content} title="主题卡片快照" /></div>;
}
