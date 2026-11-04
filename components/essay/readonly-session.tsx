import { CardReadonly } from "@/components/quick/card-readonly";
import type { CardContent } from "@/lib/quick/schemas";
import Link from "next/link";
import type { SessionState } from "@/lib/pipeline/types";

export function ReadonlySession({ session, cardContent }: { session: SessionState; cardContent?: CardContent | null }) {
  const outline = session.outline;
  const slots = [outline?.stance, ...(outline?.reasons ?? []).flatMap(r => [r.claim, r.why, r.example]), outline?.counter?.view, outline?.counter?.response];
  return (
    <main id="main-content" className="min-h-dvh bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[760px]">
        <Link href="/essays" className="text-sm text-muted-foreground hover:text-foreground">返回作文库</Link>
        <h1 className="page-heading mt-6">练习内容（只读）</h1>
        <p className="mt-2 text-sm text-muted-foreground">当前版本暂不支持编辑这份练习，已保存的内容仍可查看。</p>
        <article className="paper mt-6 space-y-8 p-6 sm:p-10">
          {cardContent && <CardReadonly content={cardContent} />}
          <TextSection title="题目" text={session.question?.text ?? session.prompt?.text} />
          {(["original", "revision"] as const).map(kind => {
            const draft = session.drafts?.[kind];
            const submitted = session.submitted?.[kind];
            const label = kind === "original" ? "原稿" : "改写稿";
            return <section key={kind} className="space-y-6">
              <TextSection title={label} text={draft || submitted} />
              {draft && submitted && draft !== submitted && <TextSection title={`${label}（已提交）`} text={submitted} />}
            </section>;
          })}
          {slots.some(slot => slot?.text) && <section><h2 className="mb-3 text-sm text-muted-foreground">提纲</h2><div className="space-y-3">{slots.map((slot, i) => slot?.text ? <p key={i} className="whitespace-pre-wrap break-words">{slot.text}</p> : null)}</div></section>}
          {(session.messages?.length ?? 0) > 0 && <section><h2 className="mb-3 text-sm text-muted-foreground">已有对话</h2><div className="space-y-5">{session.messages.map((message, i) => <div key={i}>
            <p className="mb-1 text-xs text-muted-foreground">{message.role === "user" ? "你" : "教练"}</p>
            {message.quote && <blockquote className="mb-2 whitespace-pre-wrap break-words border-l-2 pl-3 text-muted-foreground">{message.quote}</blockquote>}
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>)}</div></section>}
        </article>
      </div>
    </main>
  );
}

function TextSection({ title, text }: { title: string; text?: string | null }) {
  if (!text) return null;
  return <section><h2 className="mb-3 text-sm text-muted-foreground">{title}</h2><p className="whitespace-pre-wrap break-words font-serif leading-relaxed">{text}</p></section>;
}
