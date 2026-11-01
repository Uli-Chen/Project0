"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Mode, SessionKind } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

const TOPICS = [
  { name: "科技与生活", text: "Some people believe that technology has made our lives more complicated. Others think it has made life easier. Discuss both views and give your own opinion." },
  { name: "教育与成长", text: "Some people think schools should focus on teaching practical skills, while others believe academic subjects are more important. Discuss both views and give your own opinion." },
  { name: "工作与社会", text: "More people are choosing to work from home. Do the advantages of this development outweigh the disadvantages?" },
  { name: "环境与城市", text: "Some people believe that governments should invest more in public transport than in building new roads. To what extent do you agree or disagree?" },
];

export function useStartEssay() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start(input: { kind: SessionKind; mode: Mode; prompt?: string }) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "暂时无法开始，请稍后重试。");
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
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function NewEssayDialog({ trigger, focus }: { trigger: ReactElement; focus?: string }) {
  const [mode, setMode] = useState<Mode>("practice");
  const [source, setSource] = useState("suggested");
  const [topic, setTopic] = useState(0);
  const [text, setText] = useState("");
  const { busy, error, start } = useStartEssay();
  const pasted = text.trim();
  const ready = source !== "paste" || pasted.length >= 20;

  const submit = () => {
    if (!ready || busy) return;
    if (source === "suggested") return start({ kind: mode === "practice" && focus ? "task" : "free", mode });
    return start({ kind: "free", mode, prompt: source === "topic" ? TOPICS[topic].text : pasted });
  };

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader><DialogTitle>新建作文</DialogTitle></DialogHeader>

        <div role="radiogroup" aria-label="类型" className="grid grid-cols-2 gap-2">
          {([["practice", "练习", "有教练"], ["mock", "模考", "40 分钟 · 独立完成"]] as const).map(([value, label, meta]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
              className={cn("rounded-lg border px-3.5 py-3 text-left transition-colors", mode === value ? "border-foreground bg-secondary/60" : "hover:bg-secondary/40")}>
              <span className="block text-sm font-medium">{label}</span>
              <span className="meta mt-0.5 block">{meta}</span>
            </button>
          ))}
        </div>

        <Tabs value={source} onValueChange={(value) => setSource(String(value))} className="gap-3">
          <TabsList className="w-full">
            <TabsTrigger value="suggested">推荐</TabsTrigger>
            <TabsTrigger value="topic">话题</TabsTrigger>
            <TabsTrigger value="paste">粘贴题目</TabsTrigger>
          </TabsList>
          <TabsContent value="suggested" className="min-h-28 rounded-lg border border-dashed px-4 py-3.5">
            <p className="text-sm">从题库中随机一道题</p>
            {mode === "practice" && focus && <p className="mt-2 text-xs text-muted-foreground">本次重点 <span className="text-coach">{focus}</span></p>}
          </TabsContent>
          <TabsContent value="topic" className="min-h-28">
            <div role="radiogroup" aria-label="话题" className="flex flex-col divide-y rounded-lg border">
              {TOPICS.map((item, index) => (
                <button key={item.name} type="button" role="radio" aria-checked={topic === index} onClick={() => setTopic(index)}
                  className={cn("flex items-start gap-3 px-3.5 py-2.5 text-left first:rounded-t-lg last:rounded-b-lg", topic === index ? "bg-secondary/60" : "hover:bg-secondary/30")}>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", topic === index ? "bg-foreground" : "bg-border")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{item.name}</span>
                    <span className="mt-0.5 line-clamp-2 block font-serif text-[13px] leading-snug text-muted-foreground">{item.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="paste" className="min-h-28">
            <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={3000} rows={5} placeholder="Some people think that…" aria-label="题目" className="font-serif text-[15px]" />
            <p className="meta mt-1.5 text-right">{pasted.length < 20 ? `至少 20 个字符 · ${pasted.length}` : `${pasted.length} / 3000`}</p>
          </TabsContent>
        </Tabs>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button disabled={!ready || busy} onClick={submit}>{busy && <LoaderCircle className="animate-spin" />}开始写作</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
