"use client";

import Link from "next/link";
import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Mode, SessionKind } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

const TOPICS = [
  { name: "科技与生活", id: "technology", text: "Some people believe that technology has made our lives more complicated. Others think it has made life easier. Discuss both views and give your own opinion." },
  { name: "教育与成长", id: "education", text: "Some people think schools should focus on teaching practical skills, while others believe academic subjects are more important. Discuss both views and give your own opinion." },
  { name: "工作与社会", id: "work", text: "More people are choosing to work from home. Do the advantages of this development outweigh the disadvantages?" },
  { name: "环境与城市", id: "environment", text: "Some people believe that governments should invest more in public transport than in building new roads. To what extent do you agree or disagree?" },
];

export function useStartEssay() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per creation intent. Retrying the same choice after a lost response reuses it, so the
  // server returns the essay it already created; a different choice is a new intent.
  const intent = useRef<{ signature: string; key: string } | null>(null);
  async function start(input: { kind: SessionKind; mode: Mode; prompt?: string; topic?: string }) {
    setBusy(true); setError("");
    const signature = JSON.stringify([input.kind, input.mode, input.prompt ?? null, input.topic ?? null]);
    if (intent.current?.signature !== signature) intent.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, idempotencyKey: intent.current.key }) });
      const data = await response.json();
      // A rejected request created nothing, so the next attempt may start fresh.
      if (response.status >= 400 && response.status < 500) intent.current = null;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "暂时无法开始，请稍后重试。");
      intent.current = null;
      router.push(`/essays/${data.session.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "网络连接失败，请重试。"); setBusy(false); }
  }
  return { busy, error, start };
}

/** 一键开始，不经过对话框：入门测试等固定入口 */
export function StartEssayButton({ kind, mode, children, variant = "default" }: { kind: SessionKind; mode: Mode; children: React.ReactNode; variant?: "default" | "outline" }) {
  const { busy, error, start } = useStartEssay();
  return <div className="flex flex-col items-start gap-2">
    <Button variant={variant} disabled={busy} onClick={() => start({ kind, mode })}>{busy && <LoaderCircle className="animate-spin" />}{children}</Button>
    {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
  </div>;
}

/** Bank entry always goes to the actual catalog; pasted tasks stay explicit. */
export function NewEssayButton({ bankEnabled, focus, variant = "default" }: { bankEnabled: boolean; focus?: string; variant?: "default" | "outline" }) {
  return bankEnabled
    ? <Button variant={variant} nativeButton={false} render={<Link href="/practice" />}><Plus />新建作文</Button>
    : <NewEssayDialog focus={focus} trigger={<Button variant={variant}><Plus />新建作文</Button>} />;
}

export function NewEssayDialog({ trigger, focus, pasteOnly = false }: { trigger: ReactElement; focus?: string; pasteOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>("practice");
  const [source, setSource] = useState(pasteOnly ? "paste" : "suggested");
  const [topic, setTopic] = useState(0);
  const [text, setText] = useState("");
  // A pasted question is filed under a topic as it is created, so what it produces can be found by topic.
  const [pastedTopic, setPastedTopic] = useState<string | null>(null);
  const { busy, error, start } = useStartEssay();
  const pasted = text.trim();
  const ready = source !== "paste" || (pasted.length >= 20 && pastedTopic !== null);

  const submit = () => {
    if (!ready || busy) return;
    if (source === "suggested") return start({ kind: mode === "practice" && focus ? "task" : "free", mode });
    return source === "topic" ? start({ kind: "free", mode, prompt: TOPICS[topic].text, topic: TOPICS[topic].id }) : start({ kind: "free", mode, prompt: pasted, topic: pastedTopic! });
  };

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader><DialogTitle>{pasteOnly ? "粘贴题目" : "新建作文"}</DialogTitle></DialogHeader>
        {pasteOnly && <p className="text-sm text-muted-foreground">使用你自己的题目，独立保存为自由练习，不计入题库主题进度。</p>}

        <div role="radiogroup" aria-label="类型" className="grid grid-cols-2 gap-2">
          {([["practice", "练习", "有教练"], ["mock", "模考", "40 分钟 · 独立完成"]] as const).map(([value, label, meta]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
              className={cn("rounded-lg border px-3.5 py-3 text-left transition-colors", mode === value ? "border-primary bg-coach-soft" : "hover:bg-sunk")}>
              <span className="block text-sm font-medium">{label}</span>
              <span className="meta mt-0.5 block">{meta}</span>
            </button>
          ))}
        </div>

        {pasteOnly ? <><PastedPromptInput text={text} setText={setText} /><TopicChoice value={pastedTopic} onChange={setPastedTopic} /></> : <Tabs value={source} onValueChange={(value) => setSource(String(value))} className="gap-3">
          <TabsList className="w-full">
            <TabsTrigger value="suggested">推荐</TabsTrigger>
            <TabsTrigger value="topic">话题</TabsTrigger>
            <TabsTrigger value="paste">粘贴题目</TabsTrigger>
          </TabsList>
          <TabsContent value="suggested" className="min-h-28 rounded-lg border border-dashed px-4 py-3.5">
            <p className="text-sm">从题库中随机一道题</p>
            {mode === "practice" && focus && <p className="mt-2 text-[14px] text-muted-foreground">本次重点 <span className="text-coach">{focus}</span></p>}
          </TabsContent>
          <TabsContent value="topic" className="min-h-28">
            <div role="radiogroup" aria-label="话题" className="flex flex-col divide-y rounded-lg border">
              {TOPICS.map((item, index) => (
                <button key={item.name} type="button" role="radio" aria-checked={topic === index} onClick={() => setTopic(index)}
                  className={cn("flex items-start gap-3 px-3.5 py-2.5 text-left first:rounded-t-lg last:rounded-b-lg", topic === index ? "bg-secondary/60" : "hover:bg-secondary/30")}>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", topic === index ? "bg-primary" : "bg-border")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{item.name}</span>
                    <span className="mt-0.5 line-clamp-2 block font-serif text-[14px] leading-snug text-muted-foreground">{item.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="paste" className="min-h-28"><PastedPromptInput text={text} setText={setText} /><div className="mt-4"><TopicChoice value={pastedTopic} onChange={setPastedTopic} /></div></TabsContent>
        </Tabs>}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button disabled={!ready || busy} onClick={submit}>{busy && <LoaderCircle className="animate-spin" />}开始写作</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PastedPromptInput({ text, setText }: { text: string; setText(text: string): void }) {
  const pasted = text.trim();
  return <div className="min-h-28"><Textarea value={text} onChange={event => setText(event.target.value)} maxLength={3000} rows={5} placeholder="Some people think that…" aria-label="题目" className="font-serif text-[15px]" /><p className="meta mt-1.5 text-right">{pasted.length < 20 ? `至少 20 个字符 · ${pasted.length}` : `${pasted.length} / 3000`}</p></div>;
}

const PASTE_TOPICS: [string, string][] = [["education", "教育"], ["technology", "科技"], ["environment", "环境"], ["society", "社会"], ["work", "工作"], ["health", "健康"], ["culture", "文化"], ["other", "其他"]];

function TopicChoice({ value, onChange }: { value: string | null; onChange: (topic: string) => void }) {
  return (
    <div role="radiogroup" aria-label="话题" className="flex flex-wrap items-center gap-1">
      <span className="mr-2 text-[14px] text-muted-foreground">话题</span>
      {PASTE_TOPICS.map(([key, name]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)} className={cn("rounded-full px-3 py-1 text-[14px] transition-colors", value === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground")}>{name}</button>
      ))}
    </div>
  );
}
