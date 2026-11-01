import type { QuestionAlias } from "./types";

// 原型/12 §2.3: owner-confirmed 2026-11-01. Never infer matches by topic.
export const aliasVersion = "legacy-20261101-v1";
const reviewed = { aliasVersion, reviewedBy: "Claude Code (负责人), 2026-11-01", candidates: [] };
export const initialQuestionAliases: QuestionAlias[] = [
  { ...reviewed, kind: "legacy_id", alias: "technology", status: "matched", exposureKey: "qfamily_remote_work", note: "内置远程办公利弊题 → qb_mock_work_002 家族。" },
  { ...reviewed, kind: "legacy_id", alias: "education", status: "not_in_catalog", exposureKey: null, note: "内置大学是否免费题：负责人确认目录无此家族。" },
  { ...reviewed, kind: "legacy_id", alias: "society", status: "not_in_catalog", exposureKey: null, note: "内置年轻人迁往大城市题：负责人确认目录无此家族。" },
  { ...reviewed, kind: "text", alias: "Some people believe that technology has made our lives more complicated. Others think it has made life easier. Discuss both views and give your own opinion.", status: "not_in_catalog", exposureKey: null, note: "固定题“科技与生活”：负责人确认目录无此家族。" },
  { ...reviewed, kind: "text", alias: "Some people think schools should focus on teaching practical skills, while others believe academic subjects are more important. Discuss both views and give your own opinion.", status: "not_in_catalog", exposureKey: null, note: "固定题“教育与成长”：负责人确认目录无此家族。" },
  { ...reviewed, kind: "text", alias: "More people are choosing to work from home. Do the advantages of this development outweigh the disadvantages?", status: "matched", exposureKey: "qfamily_remote_work", note: "固定题“工作与社会” → qb_mock_work_002 家族。" },
  { ...reviewed, kind: "text", alias: "Some people believe that governments should invest more in public transport than in building new roads. To what extent do you agree or disagree?", status: "not_in_catalog", exposureKey: null, note: "固定题“环境与城市”：负责人确认目录无此家族。" },
];
