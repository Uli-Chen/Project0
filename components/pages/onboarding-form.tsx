"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { StatusButton } from "@/components/ui/status-button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/auth/types";
import { examDateFromWeeks, weeksLeft } from "@/lib/learning/summary";

const DIFFICULTIES = ["没想法", "想法说不清", "英文表达不出来", "语法错误多", "写不完"];

export function OnboardingForm({ initial }: { initial: UserProfile }) {
  const router = useRouter();
  const [target, setTarget] = useState(initial.target);
  const [timeBy, setTimeBy] = useState(initial.timeBy);
  const [examDate, setExamDate] = useState(initial.examDate);
  // Weeks are stored as the date they end on; show what is left of them, not the number first typed.
  const [weeks, setWeeks] = useState(() => initial.timeBy === "weeks" && initial.examDate ? String(Math.max(1, weeksLeft(initial))) : initial.weeks);
  const [level, setLevel] = useState(initial.level);
  const [perWeek, setPerWeek] = useState(initial.perWeek);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [difficulties, setDifficulties] = useState<string[]>(initial.difficulties);
  const [lang, setLang] = useState(initial.lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (missing.length || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, timeBy, examDate: timeBy === "date" ? examDate : examDateFromWeeks(weeks), weeks: timeBy === "weeks" ? weeks : "", level, perWeek, minutes, difficulties, lang, onboardingCompleted: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "保存失败，请检查填写内容。");
      router.push("/");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "网络连接失败，请重试。"); setBusy(false); }
  }

  const missing = [
    !target && "目标分",
    !(timeBy === "date" ? examDate : weeks) && "备考时间",
    !level && "目前水平",
    !perWeek && "每周次数",
    !minutes && "每次时长",
    difficulties.length === 0 && "最难的地方",
    !lang && "写作习惯",
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-[680px]">
      <h1 className="page-heading">{initial.onboardingCompleted ? "目标与节奏" : "设置目标"}</h1>

      <form aria-busy={busy} className="surface mt-8 flex flex-col p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-7">
          <Field label="目标分">
            <Segmented
              ariaLabel="目标分"
              value={target}
              onChange={setTarget}
              options={["5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="还有多久考试">
            <Segmented
              ariaLabel="备考时间设置方式"
              size="sm"
              value={timeBy}
              onChange={setTimeBy}
              options={[
                { value: "date", label: "我知道考试日期" },
                { value: "weeks", label: "按准备周数" },
              ]}
            />
            <div className="mt-3">
              {timeBy === "date" ? (
                <input aria-label="考试日期" type="date" required min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })} value={examDate} onChange={(e) => setExamDate(e.target.value)} className={inputClass} />
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    aria-label="准备周数"
                    required
                    min={1}
                    max={52}
                    value={weeks}
                    onChange={(e) => setWeeks(e.target.value)}
                    className={cn(inputClass, "w-24")}
                  />
                  周
                </label>
              )}
            </div>
          </Field>
          <Field label="目前的写作水平">
            <Segmented
              ariaLabel="目前的写作水平"
              value={level}
              onChange={setLevel}
              options={["未考过", "5 左右", "6 左右", "6.5 以上"].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="写作时最难的地方" hint="可多选">
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => {
                const on = difficulties.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDifficulties((list) => (on ? list.filter((x) => x !== d) : [...list, d]))}
                    className={cn(
                      "h-8 rounded-full border px-3.5 text-[14px] transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-sheet text-foreground/80 hover:border-faint",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="每周练几次">
            <Segmented ariaLabel="每周练习次数" value={perWeek} onChange={setPerWeek} options={["1", "2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} />
          </Field>
          <Field label="每次多长时间">
            <Segmented
              ariaLabel="每次练习时长"
              value={minutes}
              onChange={setMinutes}
              options={["30", "45", "60", "90"].map((v) => ({ value: v, label: `${v} 分钟` }))}
            />
          </Field>
          <Field label="想观点时你更习惯">
            <Segmented
              ariaLabel="写作思考语言"
              value={lang}
              onChange={setLang}
              options={[
                { value: "zh", label: "先用中文想，再写英文" },
                { value: "en", label: "尽量直接用英文" },
              ]}
            />
          </Field>
        </fieldset>

        {error && <p role="alert" className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
          <StatusButton type="submit" variant="default" size="lg" status={busy ? "pending" : "idle"} pendingLabel="正在保存" disabled={missing.length > 0}>
            保存
          </StatusButton>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            {initial.onboardingCompleted ? "取消" : "稍后"}
          </Link>
        </div>
        {missing.length > 0 && <p className="mt-3 text-[14px] text-muted-foreground">还需要填写：{missing.join("、")}</p>}
      </form>
    </div>
  );
}

const inputClass = "h-8 rounded-lg border border-input bg-sheet px-3 text-[14px] tabular-nums outline-none focus:border-primary/60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2.5 text-sm text-foreground/80">
        {label}
        {hint && <span className="ml-2 text-[14px] text-muted-foreground">{hint}</span>}
      </p>
      {children}
    </div>
  );
}
