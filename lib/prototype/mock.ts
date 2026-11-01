// 原型用的假模型：用固定脚本代替 llmCall，返回结构与真实接口一致。
import { countWords, splitSentences, wordDiff } from "@/lib/rules";
import { ISSUE_TEMPLATES, ORIGINAL_SCORES } from "./fixtures";
import type { Evaluation, Issue, Suggestion } from "./types";

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let seq = 0;
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function locateIssues(text: string): Issue[] {
  const sentences = splitSentences(text);
  return ISSUE_TEMPLATES.map((tpl, index) => {
    const ids = sentences
      .filter((s) => tpl.anchors.some((anchor) => s.text.includes(anchor)))
      .map((s) => s.id);
    const fallback = sentences[Math.min(sentences.length - 1, 1 + index * 3)]?.id;
    return {
      rank: index + 1,
      code: tpl.code,
      title: tpl.title,
      why: tpl.why,
      sentenceIds: ids.length ? ids : fallback ? [fallback] : [],
      hintL1: tpl.hintL1,
      recurring: tpl.recurring,
    };
  });
}

export function mockEvaluate(text: string, aiRatio: number): Evaluation {
  return {
    scores: ORIGINAL_SCORES,
    issues: locateIssues(text),
    review: {
      outlineCoverage: [
        { slot: "stance", status: "written" },
        { slot: "reasons.0.claim", status: "written" },
        { slot: "reasons.0.why", status: "partly" },
        { slot: "reasons.0.example", status: "missing" },
        { slot: "reasons.1.claim", status: "written" },
        { slot: "counter.view", status: "written" },
        { slot: "counter.response", status: "written" },
      ],
      breakthrough: "这次主动写了让步段（第 12、13 句），上次没有回应反方。",
      focusResult: { achieved: "partial", note: "第二段的理由后有一句解释，但它只是换了个说法，还没说清为什么。" },
      selfReportContrast: null,
      aiRatio,
    },
  };
}

export function hintFor(rank: number, level: 2 | 3): string {
  return ISSUE_TEMPLATES[rank - 1]?.hints[level] ?? "试着先自己写一句，我帮你看看。";
}

/** 润色：只做最小修改的演示 */
function minimalPolish(sentence: string): { text: string; reason: string } {
  const known: Array<[RegExp, string, string]> = [
    [/they think it is not important/, "they tend to see it as unimportant", "“think it is not important”偏口语，换成更自然的表达。"],
    [/The government need\b/, "The government needs", "主语 the government 是单数，动词用 needs。"],
    [/government can give scholarship\b/, "the government can give scholarships", "特指的政府加 the；奖学金给很多学生，用复数。"],
    [/unfair for people/, "unfair to people", "unfair 对某人不公平，用 to。"],
    [/a hot topic/, "a widely debated issue", "hot topic 偏口语，学术写作可以更正式。"],
  ];
  for (const [re, replacement, reason] of known) {
    if (re.test(sentence)) return { text: sentence.replace(re, replacement), reason };
  }
  const trimmed = sentence.trim().replace(/\bvery\s+/gi, "");
  const text = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return { text: /[.?!]$/.test(text) ? text : `${text}.`, reason: "去掉了空泛的强调词，保持原意。" };
}

export function mockPolish(selection: string): Omit<Suggestion, "id" | "status"> {
  const { text, reason } = minimalPolish(selection);
  return { type: "polish", selectionText: selection, suggestedText: text, reason };
}

export function mockExpress(message: string): { reply: string; cards: Array<Omit<Suggestion, "id" | "status">> } {
  return {
    reply: "两种说法都可以：第一种更直接，第二种语气更正式，适合放在主体段开头。",
    cards: [
      { type: "express", selectionText: message, suggestedText: "When something is free, people tend to take it for granted.", reason: "take it for granted 是“视为理所当然”的常用说法。" },
      { type: "express", selectionText: message, suggestedText: "Free access often leads people to undervalue what they receive.", reason: "undervalue 更正式，强调低估价值。" },
    ],
  };
}

export function mockClarify(selection: string): string {
  const words = countWords(selection);
  if (words < 12) return "这段太短，还看不出论证关系。可以多选一两句吗？";
  return "这段先说了结论“学生不会珍惜”，接着直接跳到“很多人只因免费才上大学”。中间缺了一步：为什么不付钱就会不珍惜？你觉得原因是什么？";
}

export function mockCheck(selection: string): { reply: string; card: Omit<Suggestion, "id" | "status"> | null } {
  const sentences = splitSentences(selection);
  const target = sentences.find((s) => /need\b|scholarship\b|unfair for/.test(s.text)) ?? sentences[0];
  if (!target) return { reply: "没有发现明显问题。", card: null };
  const polished = minimalPolish(target.text);
  const changed = wordDiff(target.text, polished.text).some((p) => p.kind !== "same");
  return {
    reply: changed
      ? `发现 1 个问题：${polished.reason}这段的理由后面还缺一句解释，可以想想为什么。`
      : "语言上没有明显问题。这段的理由后面还缺一句解释，可以想想为什么。",
    card: changed ? { type: "check", selectionText: target.text, suggestedText: polished.text, reason: polished.reason } : null,
  };
}

export function mockChat(message: string): string {
  if (/写|代写|帮我.*段/.test(message)) {
    return "这段需要你自己来写，我可以陪你理清。先用中文说说：这一段你想证明什么？用一句话就好。";
  }
  return "好问题。雅思看的是你有没有把理由解释清楚：读者能不能从你的句子里看懂“为什么”。你可以试着在理由后面加一句以 because 或 this means 开头的解释。";
}

export function mockAttempt(text: string): string {
  if (countWords(text) < 6) return "再写完整一点，写成一个完整的句子我再帮你看。";
  return "这句把原因说出来了，方向对。可以把 it 换成 their education，读者更清楚你指的是什么。放进第二段第二句后面试试。";
}

export const NUDGE_MESSAGE = "这段有理由，但还没有例子。写前你提到表弟的学校，可以用上。";
