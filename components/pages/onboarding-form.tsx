"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { StatusButton } from "@/components/ui/status-button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/auth/types";
import { examDateToSave, weeksLeft } from "@/lib/learning/summary";

const BAND_MIN = 5, BAND_MAX = 9, BAND_STEP = 0.5, BAND_DEFAULT = "7.0";
type MissingField = "exam" | "perWeek";

export function OnboardingForm({ initial }: { initial: UserProfile }) {
  const router = useRouter();
  const [target, setTarget] = useState(initial.target ?? BAND_DEFAULT);
  const [timeBy, setTimeBy] = useState(initial.timeBy);
  const [examDate, setExamDate] = useState(initial.examDate);
  // Weeks are stored as the date they end on; show what is left of them, not the number first typed.
  // A plan that has already ended shows an empty count, so the learner enters a new one instead of seeing a made-up "1".
  const [weeks, setWeeks] = useState(() => initial.timeBy === "weeks" && initial.examDate ? (weeksLeft(initial) > 0 ? String(weeksLeft(initial)) : "") : initial.weeks);
  // Saving without touching the week count keeps the plan's end date where it is.
  const [weeksChanged, setWeeksChanged] = useState(false);
  const [perWeek, setPerWeek] = useState(initial.perWeek);
  const [explainLanguage, setExplainLanguage] = useState<"zh" | "en">(initial.explainLanguage === "en" ? "en" : "zh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Missing fields are flagged only after the learner tries to save, at the field itself.
  const [attempted, setAttempted] = useState(false);
  const examRef = useRef<HTMLDivElement>(null), perWeekRef = useRef<HTMLDivElement>(null);

  // An ended weeks plan that the learner leaves untouched keeps its date, so other settings can still be saved.
  const keepsPlan = initial.timeBy === "weeks" && !!initial.examDate && !weeksChanged;
  const missing: MissingField[] = [
    ...(!(timeBy === "date" ? examDate : weeks || keepsPlan) ? ["exam" as const] : []),
    ...(!perWeek ? ["perWeek" as const] : []),
  ];
  const flagged = (field: MissingField) => attempted && missing.includes(field);

  async function save() {
    if (busy) return;
    if (missing.length) {
      setAttempted(true);
      const first = missing[0] === "exam" ? examRef.current : perWeekRef.current;
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.querySelector<HTMLElement>("input, [role=radio][tabindex='0']")?.focus({ preventScroll: true });
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, timeBy, examDate: examDateToSave(initial, { timeBy, examDate, weeks, weeksChanged }), weeks: timeBy === "weeks" ? weeks : "", perWeek, explainLanguage, onboardingCompleted: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "保存失败，请检查填写内容。");
      router.push("/");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "网络连接失败，请重试。"); setBusy(false); }
  }

  return (
    <div className="max-w-[680px]">
      <h1 className="page-heading">{initial.onboardingCompleted ? "目标与节奏" : "设置目标"}</h1>

      <form aria-busy={busy} noValidate className="surface mt-8 flex flex-col p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-8">
          <Field label="目标分">
            <BandSlider value={target} onChange={setTarget} />
          </Field>
          <Field label="还有多久考试" ref={examRef} problem={flagged("exam") ? "选一个考试日期，或者填准备周数" : undefined}>
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
                <input aria-label="考试日期" aria-invalid={flagged("exam")} type="date" min={examDate && examDate === initial.examDate ? undefined : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })} value={examDate} onChange={(e) => setExamDate(e.target.value)} className={cn(inputClass, flagged("exam") && invalidClass)} />
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    aria-label="准备周数"
                    aria-invalid={flagged("exam")}
                    min={1}
                    max={52}
                    value={weeks}
                    onChange={(e) => { setWeeks(e.target.value); setWeeksChanged(true); }}
                    className={cn(inputClass, "w-24", flagged("exam") && invalidClass)}
                  />
                  周
                </label>
              )}
            </div>
          </Field>
          <Field label="每周练几次" ref={perWeekRef} problem={flagged("perWeek") ? "选每周练几次" : undefined}>
            <Segmented ariaLabel="每周练习次数" value={perWeek} onChange={setPerWeek} options={["1", "2", "3", "4", "5", "6", "7"].map((v) => ({ value: v, label: v }))} />
          </Field>
          <Field label="教练讲解用">
            <Segmented
              ariaLabel="教练讲解语言"
              value={explainLanguage}
              onChange={setExplainLanguage}
              options={[
                { value: "zh", label: "中文" },
                { value: "en", label: "English" },
              ]}
            />
          </Field>
        </fieldset>

        {error && <p role="alert" className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
          <StatusButton type="submit" variant="default" size="lg" status={busy ? "pending" : "idle"} pendingLabel="正在保存">
            保存
          </StatusButton>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            {initial.onboardingCompleted ? "取消" : "稍后"}
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputClass = "h-8 rounded-lg border border-input bg-sheet px-3 text-[14px] tabular-nums outline-none focus:border-primary/60";
const invalidClass = "border-warn focus:border-warn";
const ticks = [5, 6, 7, 8, 9];
const position = (band: number) => (band - BAND_MIN) / (BAND_MAX - BAND_MIN);

function BandSlider({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const band = Number(value);
  return (
    <div className="max-w-[440px]">
      <p className="text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums" aria-hidden>{band.toFixed(1)}</p>
      <input
        type="range"
        aria-label="目标分"
        aria-valuetext={`${band.toFixed(1)} 分`}
        min={BAND_MIN}
        max={BAND_MAX}
        step={BAND_STEP}
        value={band}
        onChange={(event) => onChange(Number(event.target.value).toFixed(1))}
        className="band-slider mt-4 block"
        style={{ "--p": position(band) } as React.CSSProperties}
      />
      {/* Labels sit under the thumb's centre at each whole band. */}
      <div className="relative mt-2 h-5 text-[13px] text-muted-foreground tabular-nums" aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: `calc(0.625rem + (100% - 1.25rem) * ${position(tick)})` }}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, problem, children, ref }: { label: string; problem?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div role="group" aria-label={label} ref={ref}>
      <p className="mb-2.5 text-sm text-foreground/80">{label}</p>
      {children}
      {problem && <p role="alert" className="mt-2 text-sm text-warn">{problem}</p>}
    </div>
  );
}
