// 原型演示数据。所有分数、问题与记忆都是手写的样例，不来自模型。
import type {
  Comparison,
  Focus,
  MemoryChange,
  MemoryItem,
  Outline,
  PlanTask,
  Prompt,
  Scores,
  User,
} from "./types";

export const USERS: User[] = [
  { id: "u_chen", name: "Chen" },
  { id: "u_lin", name: "林晓" },
  { id: "u_maya", name: "Maya" },
];

export const PROMPTS: Record<string, Prompt> = {
  p_edu_02: {
    id: "p_edu_02",
    text: "Some people believe that university education should be free for all students. To what extent do you agree or disagree?",
    topicTags: ["education"],
    questionType: "agree_disagree",
  },
  p_tech_01: {
    id: "p_tech_01",
    text: "Many people now work from home using modern technology. Do the advantages of this trend outweigh the disadvantages?",
    topicTags: ["technology", "work"],
    questionType: "adv_disadv",
  },
  p_place: {
    id: "p_place",
    text: "In many countries, more and more young people are leaving their hometowns to live in big cities. Why is this happening? Is it a positive or negative development?",
    topicTags: ["society"],
    questionType: "two_part",
  },
};

export const FOCUS_T02: Focus = {
  code: "T02",
  name: "理由停在断言",
  instruction: "每个理由后面都回答一次“为什么”",
  reason: "入门测试和上次练习里，主体段的理由都只给了结论，这是 TR 失分最多的地方。",
};

export const FOCUS_T03: Focus = {
  code: "T03",
  name: "例子缺失或空泛",
  instruction: "每个理由配一个具体例子：谁、在什么情况下、发生了什么",
  reason: "上次两个主体段都只用了 many people 这类泛指。",
};

export const OPENING =
  "今天练“理由停在断言”。上周那篇里，你说免费会让人不珍惜，但没说为什么。这次每个理由我们都多问一句。先说说：你同意这道题吗？";

export const EMPTY_OUTLINE: Outline = {
  stance: null,
  reasons: [
    { claim: null, why: null, example: null },
    { claim: null, why: null, example: null },
  ],
  counter: { view: null, response: null },
  userEdited: false,
};

export const SAMPLE_OUTLINE: Outline = {
  stance: { text: "反对，大学不应该对所有人免费", sources: ["反对，免费的话大家就不珍惜"] },
  reasons: [
    {
      claim: { text: "免费会让学生不珍惜教育", sources: ["免费的话大家就不珍惜"] },
      why: { text: "没有付出成本，就容易把机会当成理所当然", sources: ["不用花钱就觉得无所谓"] },
      example: { text: "表弟的学校免学费，同学常常翘课", sources: ["我表弟学校就是免费的，很多人翘课"] },
    },
    {
      claim: { text: "对不上大学的纳税人不公平", sources: ["用的是大家交的税"] },
      why: null,
      example: null,
    },
  ],
  counter: { view: { text: "免费可以帮助穷学生", sources: ["有人会说能帮穷人"] }, response: null },
  userEdited: false,
};

/** 写前教练按槽位顺序追问的问题（原型脚本，替代 prewrite_turn） */
export const PREWRITE_QUESTIONS: string[] = [
  "你同意还是反对？程度有多大？",
  "好。你的第一个理由是什么？",
  "为什么会这样？中间是怎么从“免费”走到这一步的？",
  "你见过或经历过这样的情况吗？谁、在什么情况下？",
  "很具体。第二个理由呢？",
  "为什么说它不公平？谁承担了成本？",
  "能想到一个具体的人或场景吗？",
  "反对你的人会怎么说？",
  "你怎么回应他们？",
];

export const ORIGINAL_ESSAY = `Nowadays, the cost of university is a hot topic. Some people believe that higher education should be free for every student. I disagree with this view, because free education will make students value it less and it is unfair to taxpayers.

Firstly, if university is free, students will not value their education. When people do not pay for something, they think it is not important. Many students will choose university just because it is free. They will skip classes and waste their time.

Secondly, free university is unfair for people who do not go to university. The government need to use tax money to pay for it. Many people work very hard and pay tax, but they do not get any benefit from university. This is not a good situation.

Of course, some people say free education can help poor students. However, government can give scholarship to poor students instead of making university free for everyone.

In conclusion, I believe university should not be free for all students, because students will not value it and it is unfair to taxpayers.`;

export const REVISION_ESSAY = `Nowadays, the cost of university is a hot topic. Some people believe that higher education should be free for every student. I disagree with this view, because free education will make students value it less and it is unfair to taxpayers.

Firstly, if university is free, students will not value their education. When something costs nothing, people tend to treat it as a right rather than an opportunity, so they put less effort into it. For example, my cousin studies at a tuition-free college, and he told me that many of his classmates skip morning lectures because missing them costs them nothing.

Secondly, free university is unfair for people who do not go to university. The government needs to use tax money to pay for it. A factory worker who left school at eighteen would still pay for other people's degrees through his taxes, even though he never benefits from them. This is not a good situation.

Of course, some people say free education can help poor students. However, the government can give scholarships to poor students instead of making university free for everyone.

In conclusion, I believe university should not be free for all students, because students will not value it and it is unfair to taxpayers.`;

/** 问题定位用的句子片段：在提交的作文里找到包含这些片段的句子 */
export const ISSUE_TEMPLATES = [
  {
    code: "T02",
    title: "理由只给了结论",
    why: "第二段说免费会让人不珍惜，但没解释为什么会这样，考官会认为论证没有展开。",
    anchors: ["they think it is not important", "students will not value their education"],
    hintL1: "你说“不付钱就觉得不重要”。为什么不付钱，人就会这么想？",
    recurring: true,
    hints: {
      2: "在“they think it is not important”后面补一句，说明不付出成本时，人的态度会怎样变化。",
      3: "可以这样接你自己的意思：When something costs nothing, people tend to treat it as a right rather than an opportunity. 它把“不珍惜”背后的原因说出来了。",
    },
  },
  {
    code: "T03",
    title: "例子是泛指",
    why: "“Many students”“Many people”没有具体的人和场景，支持力度弱。",
    anchors: ["Many students will choose", "Many people work very hard"],
    hintL1: "写前你提到表弟的学校。那里发生过什么，能说明你的理由？",
    recurring: false,
    hints: {
      2: "把“Many students”换成一个具体的人：他是谁、在哪、做了什么。",
      3: "用你提纲里的例子：My cousin studies at a tuition-free college, and many of his classmates skip morning lectures. 有了具体的人和行为。",
    },
  },
  {
    code: "L01",
    title: "冠词和单复数",
    why: "government、scholarship 前缺冠词或复数，同类错误出现了几次。",
    anchors: ["government can give scholarship", "The government need"],
    hintL1: "看看第 9 句和第 13 句：government 前面需要什么？scholarship 是一个还是多个？",
    recurring: true,
    hints: {
      2: "特指的政府用 the government；给很多学生的奖学金用复数 scholarships。",
      3: "例如：However, the government can give scholarships to poor students.",
    },
  },
] as const;

export const ORIGINAL_SCORES: Scores = {
  overall: 5.5,
  dims: { TR: 5.5, CC: 6, LR: 5.5, GRA: 5.5 },
  rationale: {
    TR: "立场明确并贯穿全文，但主体段的理由没有展开，例子停留在泛指。",
    CC: "段落划分清楚，每段一个中心；连接词使用基本准确。",
    LR: "词汇足以表达观点，但重复较多，少有准确的搭配。",
    GRA: "以简单句为主，冠词和主谓一致有多处错误。",
  },
};

export const REVISION_SCORES: Scores = {
  overall: 6,
  dims: { TR: 6.5, CC: 6, LR: 6, GRA: 5.5 },
  rationale: {
    TR: "两个理由都有解释和具体例子，论证更完整。",
    CC: "段落结构保持清楚，新增句子衔接自然。",
    LR: "出现了 treat it as a right rather than an opportunity 等较准确的表达。",
    GRA: "复合句增多，仍有少量冠词问题。",
  },
};

export const COMPARISON: Omit<Comparison, "aiRatio"> = {
  issues: [
    { rank: 1, status: "resolved", reason: "补上了“不付出成本就当成理所当然”这层原因。", revisionSentenceIds: [5] },
    { rank: 2, status: "partly", reason: "第二段有了表弟的例子；第三段的例子仍偏概括。", revisionSentenceIds: [6, 9] },
    { rank: 3, status: "resolved", reason: "the government、scholarships 已改正。", revisionSentenceIds: [8, 12] },
  ],
  idea: {
    stanceKept: true,
    keptPoints: ["免费会让学生不珍惜教育", "用纳税人的钱对不上大学的人不公平", "奖学金比全员免费更合理"],
    deepened: [
      { what: "解释了“不珍惜”背后的原因", originalIds: [5], revisionIds: [5] },
      { what: "把“很多学生”换成了表弟学校的具体情况", originalIds: [6, 7], revisionIds: [6] },
    ],
    changed: [],
  },
};

export const MEMORY_CHANGES: MemoryChange[] = [
  { kind: "recurring", text: "理由停在断言又出现了，之后会重点练" },
  { kind: "improving", text: "没有回应反方这次没有出现，在改善" },
  { kind: "new", text: "新发现：主谓一致（第 9 句）" },
  { kind: "idea", text: "记下了你的素材：表弟的学校免学费，同学常翘课" },
];

export const PLAN_CHANGE_SUMMARY = "下周第一项任务改为“例子缺失或空泛”，因为这次改写后它只解决了一部分。";

export const PLAN = {
  targetScore: 6.5,
  baseline: 5.5,
  latestMock: 6,
  totalWeeks: 8,
  currentWeek: 3,
  sessionsPerWeek: 3,
  minutesPerSession: 60,
  phases: [
    { phase: "补弱点", from: 1, to: 3 },
    { phase: "强化", from: 4, to: 6 },
    { phase: "冲刺", from: 7, to: 8 },
  ],
  checkpointNote: "第 2 周检查点：模考 6.0，比入门测试高 0.5，进度基本符合预期。单篇模考有波动，下次检查点再看趋势。",
  warning: null as null | string,
};

export const PLAN_TASKS: PlanTask[] = [
  { id: "t_21", week: 2, seq: 1, type: "focus_practice", focus: FOCUS_T02, promptTopic: "education", promptText: PROMPTS.p_edu_02.text, status: "done", result: "部分做到" },
  { id: "t_22", week: 2, seq: 2, type: "rewrite", focus: FOCUS_T02, promptTopic: "education", promptText: PROMPTS.p_edu_02.text, status: "done", result: "做到" },
  { id: "t_23", week: 2, seq: 3, type: "mock_checkpoint", focus: null, promptTopic: "society", promptText: PROMPTS.p_place.text, status: "done", result: "模考 6.0" },
  { id: "t_31", week: 3, seq: 1, type: "focus_practice", focus: FOCUS_T02, promptTopic: "education", promptText: PROMPTS.p_edu_02.text, status: "todo" },
  { id: "t_32", week: 3, seq: 2, type: "focus_practice", focus: FOCUS_T03, promptTopic: "technology", promptText: PROMPTS.p_tech_01.text, status: "todo" },
  { id: "t_33", week: 3, seq: 3, type: "rewrite", focus: FOCUS_T03, promptTopic: "technology", promptText: PROMPTS.p_tech_01.text, status: "todo" },
  { id: "t_41", week: 4, seq: 1, type: "focus_practice", focus: FOCUS_T03, promptTopic: "health", promptText: "", status: "todo" },
  { id: "t_42", week: 4, seq: 2, type: "rewrite", focus: FOCUS_T03, promptTopic: "health", promptText: "", status: "todo" },
  { id: "t_43", week: 4, seq: 3, type: "mock_checkpoint", focus: null, promptTopic: "culture", promptText: "", status: "todo" },
];

export const PLAN_CHANGES = [
  { date: "2026-10-20", text: "第 2 周检查点完成，节奏不变；第 3 周继续练“理由停在断言”。" },
  { date: "2026-10-16", text: "“没有回应反方”连续两次没有出现，从重点中移出。" },
  { date: "2026-10-09", text: "根据入门测试生成计划：共 8 周，每周 3 次。" },
];

export const MEMORY_ITEMS: MemoryItem[] = [
  { id: "m1", kind: "thinking", code: "T02", summary: "理由停在断言", status: "recurring", seen: 2, checked: 3, evidence: { sentence: "When people do not pay for something, they think it is not important.", date: "2026-10-18" }, topicTags: [] },
  { id: "m2", kind: "thinking", code: "T03", summary: "例子缺失或空泛", status: "observed_once", seen: 1, checked: 3, evidence: { sentence: "Many students will choose university just because it is free.", date: "2026-10-18" }, topicTags: [] },
  { id: "m3", kind: "thinking", code: "T06", summary: "没有回应反方", status: "improving", seen: 1, checked: 3, evidence: { sentence: "Working from home is better for everyone.", date: "2026-10-09" }, topicTags: [] },
  { id: "m4", kind: "language", code: "L01", summary: "冠词", status: "recurring", seen: 3, checked: 3, evidence: { sentence: "However, government can give scholarship to poor students.", date: "2026-10-18" }, topicTags: [] },
  { id: "m5", kind: "language", code: "L02", summary: "主谓一致", status: "observed_once", seen: 1, checked: 3, evidence: { sentence: "The government need to use tax money to pay for it.", date: "2026-10-18" }, topicTags: [] },
  { id: "m6", kind: "behavior", code: "B02", summary: "字数不足", status: "resolved", seen: 1, checked: 3, evidence: null, topicTags: [] },
  { id: "m7", kind: "idea", code: null, summary: "表弟的学校免学费，很多同学翘早课", status: null, seen: 0, checked: 0, evidence: { sentence: "我表弟学校就是免费的，很多人翘课", date: "2026-10-18" }, topicTags: ["education"] },
  { id: "m8", kind: "idea", code: null, summary: "居家办公省下通勤时间，用来陪孩子", status: null, seen: 0, checked: 0, evidence: { sentence: "我姐姐在家上班以后每天多出两小时", date: "2026-10-12" }, topicTags: ["work", "technology"] },
  { id: "m9", kind: "preference", code: null, summary: "先中文想再写英文", status: null, seen: 0, checked: 0, evidence: null, topicTags: [] },
  { id: "m10", kind: "self_report", code: null, summary: "想法说不清", status: null, seen: 0, checked: 0, evidence: null, topicTags: [] },
  { id: "m11", kind: "self_report", code: null, summary: "语法错误多", status: null, seen: 0, checked: 0, evidence: null, topicTags: [] },
];

export const PROGRESS = {
  mockScores: [
    { date: "2026-10-09", label: "入门测试", overall: 5.5, dims: { TR: 5, CC: 6, LR: 5.5, GRA: 5.5 } },
    { date: "2026-10-20", label: "第 2 周检查点", overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 5.5 } },
  ],
  practiceScores: [
    { date: "2026-10-12", original: 5.5, revision: 6 },
    { date: "2026-10-16", original: 5.5, revision: 6 },
    { date: "2026-10-18", original: 6, revision: 6.5 },
  ],
  plan: { done: 4, skipped: 0, scheduled: 9 },
};
