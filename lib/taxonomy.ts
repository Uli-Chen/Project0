// 原型/90 §2, §4.1. Registration only: scoring/diagnosis still emits free strings.
// Do not treat existing issues[].code as a validated taxonomy code.
export const taxonomyVersion = "20261101-v1";
export type TaxonomyCode = "T01" | "T02" | "T03" | "T04" | "T05" | "T06" | "T07" | "T08" | "T09" | "L01" | "L02" | "L03" | "L04" | "L05" | "L06" | "L07" | "L08" | "L09" | "L10" | "L11" | "B01" | "B02";
export type ScoringDimension = "TR" | "CC" | "LR" | "GRA";
export type TaxonomyEntry = {
  code: TaxonomyCode; name: string; dims: readonly ScoringDimension[];
  detect: string; instruction: string; success: string | null;
  prewrite: string | null; nudge: string | null;
};
// null means not specified/applicable in §2; B entries are instruction additions,
// not primary focus candidates. No new success rubric is invented for them.
export const taxonomy = {
  "T01": {"code": "T01", "name": "立场不清或前后不一致", "dims": ["TR"], "detect": "开头未明确立场；或正文与开头立场矛盾", "instruction": "开头一句话说清你的立场，全文都为它服务", "success": "开头有明确立场，且结尾与之一致", "prewrite": "先问“你同意还是反对，程度多大？”", "nudge": "段落内容与提纲立场相反"},
  "T02": {"code": "T02", "name": "理由停在断言", "dims": ["TR", "CC"], "detect": "主体段的理由只给结论，没有解释为什么成立", "instruction": "每个理由后面都回答一次“为什么”", "success": "每个主体段的理由后至少有一句解释", "prewrite": "对每个理由追问“为什么会这样？”", "nudge": "段落有理由句但没有解释句"},
  "T03": {"code": "T03", "name": "例子缺失或空泛", "dims": ["TR"], "detect": "主体段没有例子，或只有 many people / some studies 这类泛指", "instruction": "每个理由配一个具体例子：谁、在什么情况下、发生了什么", "success": "每个主体段至少有一个具体例子", "prewrite": "追问“你见过或经历过这样的情况吗？”", "nudge": "段落结束但没有例子"},
  "T04": {"code": "T04", "name": "例子与论点对不上", "dims": ["TR"], "detect": "例子不能支持它所在段落的理由", "instruction": "写完例子后检查：它证明的是这段的理由吗", "success": "所有例子都能支持所在段落的理由", "prewrite": "追问“这个例子说明了什么？”", "nudge": "例子与该段理由无关"},
  "T05": {"code": "T05", "name": "论证跳步", "dims": ["CC", "TR"], "detect": "从前提到结论中间缺少关键一步", "instruction": "把“因为 A 所以 C”补成“因为 A，导致 B，所以 C”", "success": "主体段的推理没有明显跳步", "prewrite": "追问“中间是怎么从这一步到那一步的？”", "nudge": "段内结论缺少中间环节"},
  "T06": {"code": "T06", "name": "没有回应反方", "dims": ["TR"], "detect": "题目有明显争议，但全文没有提及或回应相反观点", "instruction": "写一段让步：承认对方有道理的地方，再说明为什么你仍坚持", "success": "有让步并给出回应", "prewrite": "追问“反对你的人会怎么说？你怎么回应？”", "nudge": "不触发"},
  "T07": {"code": "T07", "name": "跑题或回答不全", "dims": ["TR"], "detect": "没回应题目的核心问题，或两部分题只答了一部分", "instruction": "动笔前把题目要回答的问题逐条列出，写完逐条核对", "success": "题目的每个要求都有回应", "prewrite": "先和用户一起拆解题目问的是什么", "nudge": "段落主题与题目无关"},
  "T08": {"code": "T08", "name": "段落中心不明确", "dims": ["CC"], "detect": "主体段没有主题句，或一段混合多个理由", "instruction": "每段第一句写出本段要说的理由，一段只讲一个", "success": "每个主体段有主题句，且只讲一个理由", "prewrite": "确认每个理由各自成段", "nudge": "段落包含两个以上理由"},
  "T09": {"code": "T09", "name": "结尾只重复开头", "dims": ["CC", "TR"], "detect": "结尾段与开头几乎同义复述，没有总结或延伸", "instruction": "结尾总结两个理由，并说明它们共同指向的结论", "success": "结尾包含对理由的概括", "prewrite": "不追问", "nudge": "不触发"},
  "L01": {"code": "L01", "name": "冠词", "dims": ["GRA"], "detect": "冠词遗漏或误用 ≥2 处", "instruction": "写完每段检查一遍名词前的 a / an / the", "success": "冠词错误 ≤1 处", "prewrite": null, "nudge": null},
  "L02": {"code": "L02", "name": "主谓一致", "dims": ["GRA"], "detect": "主谓不一致 ≥2 处", "instruction": "写完每句检查主语单复数与动词", "success": "主谓一致错误 ≤1 处", "prewrite": null, "nudge": null},
  "L03": {"code": "L03", "name": "时态", "dims": ["GRA"], "detect": "时态错误或无理由切换 ≥2 处", "instruction": "先确定每段的主时态，例子用过去时", "success": "时态错误 ≤1 处", "prewrite": null, "nudge": null},
  "L04": {"code": "L04", "name": "单复数与可数性", "dims": ["GRA"], "detect": "名词单复数或可数性错误 ≥2 处", "instruction": "注意不可数名词（information, advice…）不加 s", "success": "此类错误 ≤1 处", "prewrite": null, "nudge": null},
  "L05": {"code": "L05", "name": "搭配不当", "dims": ["LR"], "detect": "动词与名词、形容词与名词搭配不自然 ≥2 处", "instruction": "不确定的搭配用“英文怎么说”确认", "success": "搭配错误 ≤1 处", "prewrite": null, "nudge": null},
  "L06": {"code": "L06", "name": "用词不准或中式表达", "dims": ["LR"], "detect": "逐字翻译导致意思不清或不自然 ≥2 处", "instruction": "想表达的意思先用中文写清，再求助英文表达", "success": "此类问题 ≤1 处", "prewrite": null, "nudge": null},
  "L07": {"code": "L07", "name": "连接词重复或误用", "dims": ["CC", "LR"], "detect": "同一连接词出现 ≥3 次，或连接词逻辑关系错误", "instruction": "同一个连接词全文最多用两次，并确认逻辑关系", "success": "无连接词出现 ≥3 次，且无误用", "prewrite": null, "nudge": null},
  "L08": {"code": "L08", "name": "句式单一", "dims": ["GRA"], "detect": "绝大多数为简单句，或句型高度重复", "instruction": "每段至少用一个复合句（because / although / which）", "success": "每个主体段至少一个复合句", "prewrite": null, "nudge": null},
  "L09": {"code": "L09", "name": "句子结构错误", "dims": ["GRA"], "detect": "粘连句、残句、缺谓语 ≥2 处", "instruction": "每句检查是否只有一个主句，从句是否完整", "success": "结构错误 ≤1 处", "prewrite": null, "nudge": null},
  "L10": {"code": "L10", "name": "拼写", "dims": ["LR"], "detect": "拼写错误 ≥3 处", "instruction": "提交前通读一遍拼写", "success": "拼写错误 ≤2 处", "prewrite": null, "nudge": null},
  "L11": {"code": "L11", "name": "介词", "dims": ["GRA"], "detect": "介词错误 ≥2 处", "instruction": "动词后接的介词不确定就查", "success": "介词错误 ≤1 处", "prewrite": null, "nudge": null},
  "B01": {"code": "B01", "name": "超时或未完成", "dims": [], "detect": "原稿 `duration_sec` > 2,700（45 分钟），或结尾段缺失（最后一段不是结论段，由诊断给出）", "instruction": "这次注意控制在 40 分钟内写完", "success": null, "prewrite": null, "nudge": null},
  "B02": {"code": "B02", "name": "字数不足", "dims": [], "detect": "原稿词数 < 250", "instruction": "这次至少写到 250 词", "success": null, "prewrite": null, "nudge": null}
} as const satisfies Record<TaxonomyCode, TaxonomyEntry>;

export const dimensionDefaultFocus = { TR: "T06", CC: "T08", LR: "L06", GRA: "L09" } as const satisfies Record<ScoringDimension, TaxonomyCode>;
export const selfReportedDifficultyCodes = {
  "没想法": ["T03"], "想法说不清": ["T02", "T05"], "英文表达不出来": ["L06", "L05"],
} as const satisfies Record<string, readonly TaxonomyCode[]>;
