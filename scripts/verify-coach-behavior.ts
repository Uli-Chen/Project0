/** Private synthetic replay. Current credentials require explicit --run --use-current-config. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { CoachMessage, Evaluation } from "../lib/prototype/types";
import type { TeachingState } from "../lib/tutor/types";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { scorePackets, type Packet, type Judgment } from "../lib/tutor/evaluation";
const args = process.argv.slice(2), option = (name: string) => args[args.indexOf(name) + 1];
const action = z.record(z.string(), z.unknown());
const caseSchema = z.object({ id: z.string(), topicType: z.string(), topic: z.string(), scenario: z.string(), language: z.enum(["en", "zh"]), issue: z.boolean(), track: z.enum(["argument", "language"]), sourceMutation: z.string().nullable(), initialDifficulty: z.string(), legacyLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]), turns: z.array(action).min(1), seed: z.object({ draft: z.string(), issue: z.custom<Evaluation["issues"][number]>().nullable(), messages: z.custom<CoachMessage[]>(), thread: z.custom<TeachingState>().nullable() }).optional(), seedHistory: z.number().int(), difficulties: z.array(z.string()), excludedMemoryIds: z.array(z.string()) });
const loadCases = () => readdirSync("data/coach-cases").filter(f => f.endsWith(".json")).sort().map(f => caseSchema.parse(JSON.parse(readFileSync(join("data/coach-cases", f), "utf8"))));
const lines = <T>(path: string): T[] => readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));

export class EvaluationLimit extends Error {
  constructor(readonly category: string) { super(category); }
}
/** Explicit cumulative authorization: prior runs consume the same ¥50 allowance. */
export function evaluationRunLimits(env: { COACH_EVAL_PREVIOUS_CNY?: string; COACH_EVAL_CONCURRENCY?: string }) {
  const previousRaw = env.COACH_EVAL_PREVIOUS_CNY;
  const concurrencyRaw = env.COACH_EVAL_CONCURRENCY;
  const previousAccountedCny = previousRaw === undefined ? 0 : Number(previousRaw);
  const concurrency = concurrencyRaw === undefined ? 3 : Number(concurrencyRaw);
  if (previousRaw?.trim() === "" || !Number.isFinite(previousAccountedCny) || previousAccountedCny < 0 || previousAccountedCny >= 50) throw new EvaluationLimit("invalid_previous_cost");
  if (concurrencyRaw?.trim() === "" || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new EvaluationLimit("invalid_concurrency");
  // Round prior spending upward to a micro-CNY, never manufacture extra allowance.
  const hardLimitCny = (50_000_000 - Math.ceil(previousAccountedCny * 1e6)) / 1e6;
  return { previousAccountedCny, hardLimitCny, concurrency };
}
/** Reserve synchronously before any await. Unknown usage keeps the full charge. */
export function evaluationBudget(maxCalls: number, maxCny: number, inputRate: number, outputRate: number, maxInput = 64000, maxOutput = 16000) {
  if (![maxCalls, maxInput, maxOutput].every(v => Number.isSafeInteger(v) && v > 0) || ![maxCny, inputRate, outputRate].every(v => Number.isFinite(v) && v > 0) || maxCny > 50) throw new EvaluationLimit("invalid_budget");
  let calls = 0, spent = 0, reserved = 0, unknownUsage = 0, violated = false;
  const ceiling = Math.ceil((maxInput * inputRate + maxOutput * outputRate)); // micro-CNY
  const cap = Math.floor(maxCny * 1e6);
  return {
    reserve(body: string) {
      if (violated || calls >= maxCalls) throw new EvaluationLimit("request_limit");
      let request: { max_tokens?: unknown; messages?: unknown };
      try { request = JSON.parse(body); } catch { throw new EvaluationLimit("invalid_request"); }
      if (request.max_tokens !== maxOutput || !Array.isArray(request.messages) || Buffer.byteLength(body, "utf8") + 320 > maxInput) throw new EvaluationLimit("request_size_limit");
      if (spent + reserved + ceiling > cap) throw new EvaluationLimit("cost_limit");
      calls++; reserved += ceiling; let settled = false;
      return (usage: unknown) => {
        if (settled) return; settled = true; reserved -= ceiling;
        const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
        const input = u?.prompt_tokens, output = u?.completion_tokens;
        if (typeof input !== "number" || typeof output !== "number" || !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) { unknownUsage++; spent += ceiling; }
        else { spent += Math.ceil(input * inputRate + output * outputRate); if (input > maxInput || output > maxOutput || spent > cap) violated = true; }
      };
    },
    snapshot: () => ({ calls, accountedCny: spent / 1e6, reservedCny: reserved / 1e6, unknownUsage, providerExceededDeclaredLimits: violated }),
  };
}
/** Captures only user learning context; never system messages, model or headers. */
export function packetContext(body: string) {
  const request = JSON.parse(body) as { messages?: { role: string; content: string }[] };
  const user = request.messages?.find(m => m.role === "user");
  if (!user) throw new EvaluationLimit("missing_learning_context");
  const context = JSON.parse(user.content) as Record<string, unknown>;
  const keys = ["task", "intent", "newThread", "learner", "outline", "issue", "original", "draft", "essay", "selection", "student", "conversation", "thread", "refs", "paragraph"];
  return Object.fromEntries(keys.filter(key => Object.hasOwn(context, key)).map(key => [key, context[key]]));
}
type Round = { id: string; mockOutput: unknown; attempts: number; context: ReturnType<typeof packetContext> | null; failures: string[] };
const rounds = new AsyncLocalStorage<Round>();
function failureCategory(error: unknown): string {
  if (error instanceof EvaluationLimit) return error.category;
  const name = error instanceof Error ? error.name : "";
  if (error instanceof Error && /格式/.test(error.message)) return "schema_rejected";
  if (error instanceof Error && /超时/.test(error.message)) return "timeout";
  if (error instanceof Error && /未完成|不完整/.test(error.message)) return "incomplete_output";
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  return "transport_or_output_error";
}

async function main() {
  const cases = loadCases();
  if (args.includes("--score")) {
    const dir = resolve(option("--score"));
    const selectedJudgments = args.includes("--judgments") ? option("--judgments") : join(dir, "judgments.jsonl");
    if (!selectedJudgments || selectedJudgments.startsWith("--")) throw new EvaluationLimit("missing_judgments_path");
    const judgmentPath = resolve(selectedJudgments);
    const judgmentSchema = z.object({ id: z.string(), violations: z.array(z.enum(["G1", "G2", "G3", "G4", "G5", "G6"])), severe: z.boolean(), effective: z.boolean(), previousCorrect: z.boolean(), repeated: z.boolean(), unsure: z.boolean(), reason: z.string().min(1) }).strict();
    const score = scorePackets(lines<Packet>(join(dir, "index.jsonl")), lines<unknown>(judgmentPath).map(v => judgmentSchema.parse(v)) as Judgment[]);
    const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
    const completeLiveRun = run.mode === "live" && run.completedRounds === run.plannedRounds && !run.halted;
    const passed = score.passed && completeLiveRun;
    const designGateMapping = { ...score.designGateMapping, completeLiveRun, eligibleForFormalReview: score.designGateMapping.eligibleForFormalReview && completeLiveRun };
    const judgmentSource = { file: basename(judgmentPath), sha256: createHash("sha256").update(readFileSync(judgmentPath)).digest("hex") };
    console.log(JSON.stringify({ ...score, passed, designGateMapping, completeLiveRun, judgmentSource, cost: run }, null, 2)); if (!passed) process.exitCode = 2; return;
  }
  const limits = evaluationRunLimits({ COACH_EVAL_PREVIOUS_CNY: process.env.COACH_EVAL_PREVIOUS_CNY, COACH_EVAL_CONCURRENCY: process.env.COACH_EVAL_CONCURRENCY });
  const mock = args.includes("--mock"), useCurrent = args.includes("--use-current-config");
  if (mock && args.includes("--run")) throw new EvaluationLimit("ambiguous_run_mode");
  if (useCurrent && (!args.includes("--run") || mock)) throw new EvaluationLimit("current_config_requires_explicit_live_run");
  if (useCurrent) {
    const configured = parseEnv(readFileSync(".env.local", "utf8"));
    for (const key of ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const) {
      if (configured[key]) process.env[key] = configured[key];
    }
  }
  const repeats = 3, turns = cases.reduce((n, c) => n + c.turns.length, 0) * repeats, maxCalls = 432;
  const inputRate = Number(process.env.COACH_EVAL_INPUT_CNY_PER_MILLION), outputRate = Number(process.env.COACH_EVAL_OUTPUT_CNY_PER_MILLION);
  const maxInput = 64000, maxOutput = 16000;
  const priced = Number.isFinite(inputRate) && inputRate > 0 && Number.isFinite(outputRate) && outputRate > 0;
  const bound = priced ? maxCalls * (maxInput * inputRate + maxOutput * outputRate) / 1e6 : null;
  console.log(JSON.stringify({ mode: mock ? "mock" : args.includes("--run") ? "live" : "dry-run", cases: cases.length, multiTurn: cases.filter(c => c.turns.length > 1).length, turns, maxProviderAttempts: maxCalls, ...limits, totalAuthorizedCny: 50, projectedWorstCaseCny: bound, pricingSource: process.env.COACH_EVAL_PRICE_SOURCE ?? "not provided", hasAuthorizedKey: Boolean(useCurrent ? process.env.LLM_API_KEY : process.env.COACH_EVAL_API_KEY) }));
  if (!args.includes("--run") && !mock) return;
  if (!mock && (!(useCurrent ? process.env.LLM_API_KEY : process.env.COACH_EVAL_API_KEY) || !priced || !process.env.COACH_EVAL_PRICE_SOURCE || bound === null)) throw new EvaluationLimit("missing_authorized_key_or_dated_prices");
  if (mock) process.env.LLM_API_KEY = "synthetic-only";
  else if (!useCurrent) process.env.LLM_API_KEY = process.env.COACH_EVAL_API_KEY;
  if (!useCurrent && process.env.COACH_EVAL_BASE_URL) process.env.LLM_BASE_URL = process.env.COACH_EVAL_BASE_URL;
  if (!useCurrent && process.env.COACH_EVAL_MODEL) process.env.LLM_MODEL = process.env.COACH_EVAL_MODEL;
  process.env.TUTOR_V2_ENABLED = "true";
  const [{ createSession }, { runAction }, { DEFAULT_PROFILE }, { actionSchema }, { promptConfigVersion }, { tutorWarnings }] = await Promise.all([import("../lib/pipeline/initial"), import("../lib/pipeline/engine"), import("../lib/auth/types"), import("../lib/pipeline/schemas"), import("../lib/llm/budget"), import("../lib/tutor/runtime")]);
  const dir = resolve("artifacts/private/coach-eval", new Date().toISOString().replace(/[:.]/g, "-")); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const corpusDigest = digest(readdirSync("data/coach-cases").filter(f => f.endsWith(".json")).sort().map(f => `${f}\n${readFileSync(join("data/coach-cases", f), "utf8")}`).join("\n"));
  const rubricDigest = digest(readFileSync("data/coach-cases/rubric.md", "utf8"));
  const promptFiles = ["system/coach-preamble", "system/coach-language-en", "system/coach-language-zh", "system/retry", ...["prewrite", "chat", "clarify", "polish", "express", "check", "issue", "nudge"].map(n => `coach-v2/${n}`)];
  const promptDigest = digest(promptFiles.map(f => `${f}\n${readFileSync(join("prompts", `${f}.txt`), "utf8")}`).join("\n"));
  const frozen = { corpusDigest, rubricDigest, promptDigest, promptConfigVersion, model: process.env.LLM_MODEL?.trim() || "deepseek-flash", credentialSource: mock ? "mock" : useCurrent ? "current-config" : "dedicated" };
  const packets: unknown[] = [], diagnostics: unknown[] = [], index: (Packet & { warnings: Record<string, number> })[] = [], realFetch = globalThis.fetch;
  const budget = evaluationBudget(maxCalls, limits.hardLimitCny, mock ? 0.000001 : inputRate, mock ? 0.000001 : outputRate);
  let halted: string | null = null;
  globalThis.fetch = async (...fetchArgs) => {
    const round = rounds.getStore();
    if (!round) throw new EvaluationLimit("missing_round_context");
    const body = String(fetchArgs[1]?.body ?? "");
    let settle: ReturnType<typeof budget.reserve>;
    try {
      if (halted) throw new EvaluationLimit(halted);
      round.context = packetContext(body);
      settle = budget.reserve(body); // synchronous reservation prevents cross-worker races
    } catch (error) {
      const category = failureCategory(error); round.failures.push(category);
      if (error instanceof EvaluationLimit) halted = category;
      throw error;
    }
    round.attempts++;
    if (mock) {
      await new Promise(resolve => setTimeout(resolve, 2)); // exercise concurrent context isolation
      settle({ prompt_tokens: 0, completion_tokens: 0 });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(round.mockOutput) } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
    }
    try {
      const response = await realFetch(...fetchArgs);
      const payload = await response.clone().json().catch(() => null);
      settle(payload?.usage);
      diagnostics.push({ id: round.id, attempt: round.attempts, status: response.status, finishReason: payload?.choices?.[0]?.finish_reason ?? null, content: typeof payload?.choices?.[0]?.message?.content === "string" ? payload.choices[0].message.content : null, usage: payload?.usage ? { prompt_tokens: payload.usage.prompt_tokens ?? null, completion_tokens: payload.usage.completion_tokens ?? null } : null });
      if (budget.snapshot().providerExceededDeclaredLimits) halted = "provider_usage_exceeded_limits";
      if (!response.ok) round.failures.push(`provider_http_${response.status}`);
      else if (!payload) round.failures.push("response_not_json");
      else if (payload.choices?.[0]?.finish_reason !== "stop") round.failures.push("incomplete_output");
      return response;
    } catch (error) { settle(undefined); round.failures.push(failureCategory(error)); throw error; }
  };
  const flush = () => {
    writeFileSync(join(dir, "diagnostics.jsonl"), diagnostics.map(p => JSON.stringify(p)).join("\n") + "\n", { mode: 0o600 });
    writeFileSync(join(dir, "packet.jsonl"), packets.map(p => JSON.stringify(p)).join("\n") + "\n", { mode: 0o600 });
    writeFileSync(join(dir, "index.jsonl"), index.map(p => JSON.stringify(p)).join("\n") + "\n", { mode: 0o600 });
    writeFileSync(join(dir, "run.json"), JSON.stringify({ mode: mock ? "mock" : "live", ...frozen, ...limits, ...budget.snapshot(), totalAuthorizedCny: 50, cumulativeAccountedCny: limits.previousAccountedCny + budget.snapshot().accountedCny, maximumCny: limits.hardLimitCny, projectedWorstCaseCny: bound, completedRounds: index.length, plannedRounds: turns, warningCounts: index.reduce<Record<string, number>>((sum, row) => { for (const [key, n] of Object.entries(row.warnings)) sum[key] = (sum[key] ?? 0) + n; return sum; }, {}), halted, pricingSource: process.env.COACH_EVAL_PRICE_SOURCE, rubricStatus: "local-review-v1; designated-owner-signoff-pending" }), { mode: 0o600 });
  };
  const jobs = cases.flatMap(c => Array.from({ length: repeats }, () => c));
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length && !halted) {
      const c = jobs[cursor++];
      let state = createSession({ kind: "free", mode: "practice", prompt: c.topic });
      state.drafts.original = c.track === "language" ? "This seem easy but make students tired." : "I support public transport because it saves money. I do not need to buy a car.";
      for (let i = 0; i < c.seedHistory; i++) state.messages.push({ id: `history-${i}`, role: i % 2 ? "coach" : "user", stage: "prewriting", content: i % 2 ? "What follows from that?" : "我坐公交车省钱，因为不用买车。" });
      if (c.issue) {
        state.stage = "revising"; state.submitted.original = state.drafts.original; state.drafts.revision = state.drafts.original; state.issueLevels[1] = c.legacyLevel;
        state.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "fixture", CC: "fixture", LR: "fixture", GRA: "fixture" } }, issues: [{ rank: 1, code: c.track === "language" ? "GRA" : "TR", title: c.track === "language" ? "主谓一致" : "解释观点与理由的联系", why: c.track === "language" ? "This is singular" : "需要解释学生自己理由的推理过程", sentenceIds: [1], hintL1: c.track === "language" ? "检查谓语" : "解释理由为何支持你的立场", recurring: false }], review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
      }
      if (c.seed) {
        state.drafts.original = c.seed.draft;
        state.messages = structuredClone(c.seed.messages);
        if (c.issue) {
          state.submitted.original = c.seed.draft; state.drafts.revision = c.seed.draft;
          state.evaluation!.issues = c.seed.issue ? [structuredClone(c.seed.issue)] : [];
        }
        if (c.seed.thread) state.tutor = { v: 1, brief: null, activeThread: c.seed.thread.key, threads: { [c.seed.thread.key]: structuredClone(c.seed.thread) }, helpEvents: [] };
      }
      const profile = { ...DEFAULT_PROFILE, explainLanguage: c.language, difficulties: c.difficulties, excludedMemoryIds: c.excludedMemoryIds };
      for (const raw of c.turns) {
        if (halted) break;
        const input = actionSchema.parse(raw), id = crypto.randomUUID();
        state.pendingAction = { requestId: crypto.randomUUID(), input, startedAt: new Date().toISOString(), tutor: { v2: true, explainLanguage: c.language, promptConfigVersion } };
        const history = state.messages.map(m => ({ role: m.role, content: m.content }));
        const threadKey = c.issue ? "issue:1" : "prewrite";
        const thread = state.tutor?.threads[threadKey] ?? null;
        const mockOutput = { move: "confirm", reply: "请继续说明你自己的想法。", help: { level: 0 }, ...(thread ? {} : { track: c.issue ? c.track : "argument" }), delta: [], payload: {} }; const oldCount = state.messages.length; let valid = false;
        const round: Round = { id, mockOutput, attempts: 0, context: null, failures: [] };
        await rounds.run(round, async () => {
          try { state = await runAction(state, input, () => {}, [], profile); valid = true; }
          catch (error) { if (!round.failures.length) round.failures.push(failureCategory(error)); }
        });
        const added = state.messages.slice(oldCount).filter(m => m.role === "coach");
        packets.push({ id, topic: c.topic, history, student: "text" in input ? input.text : "（请求提示）", action: input, newThread: thread === null, learningContext: round.context, thread: round.context?.thread ?? null, failureCategories: round.failures, reply: valid ? added.map(m => m.content).join("\n") : "无有效输出", suggestions: added.flatMap(m => m.suggestionIds ?? []).map(s => ({ text: state.suggestions[s].suggestedText, reason: state.suggestions[s].reason })) });
        const studentTexts = [...state.messages.filter(m => m.role === "user" && m.action !== "hint").map(m => m.content), state.drafts.original, state.drafts.revision];
        const warnings = valid ? tutorWarnings(added.map(m => m.content).join("\n"), input.action, studentTexts) : {};
        index.push({ id, scenario: c.id, valid, attempts: round.attempts, deterministic: valid, warnings }); flush();
        console.log(JSON.stringify({ event: "round_completed", id, completed: index.length, total: turns, valid, attempts: round.attempts, failureCategories: round.failures, ...budget.snapshot() }));
      }
    }
  };
  try { await Promise.allSettled(Array.from({ length: limits.concurrency }, () => worker().catch(() => { halted = "worker_error"; }))); }
  finally { globalThis.fetch = realFetch; flush(); }
  console.log(JSON.stringify({ privateRunDirectory: dir, ...limits, ...budget.snapshot(), cumulativeAccountedCny: limits.previousAccountedCny + budget.snapshot().accountedCny, completedRounds: index.length, plannedRounds: turns, halted, semanticStatus: "pending independent owner judgment" }));
  if (halted || index.length !== turns) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(JSON.stringify({ event: "evaluation_failed", category: failureCategory(error) })); process.exitCode = 1; });
