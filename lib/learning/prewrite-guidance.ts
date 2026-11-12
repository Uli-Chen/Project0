import type { CoachMessage, Prompt } from '../prototype/types';
export const legacyPrewriteOpening = '先读一遍题目。你的立场是什么？可以用中文或英文告诉我，我们一起把你的想法整理成提纲。';
const openings: Record<Prompt['questionType'], string> = {
 agree_disagree: '先读一遍题目。你同意到什么程度，为什么？可以用中文或英文先说说自己的想法。',
 discuss_both: '先读一遍题目。双方分别持什么观点？你可以先选一方，说说你想到的理由，再整理自己的看法。',
 adv_disadv: '先读一遍题目。你想到了哪些好处和坏处？如果题目要求比较孰重，再说明你的判断。',
 problem_solution: '先看题目具体问了什么：问题或原因，以及相应对策。你想先从哪一部分说起？',
 two_part: '先把题目中的两个问题分开看。你想先回答哪一个？可以用中文或英文说说自己的回答和理由。',
};
export function prewriteOpening(type: Prompt['questionType']) { return openings[type]; }
/** Opening for an essay continued from a topic card whose text already sits in the outline. */
export const cardPrewriteOpening = '你在速刷卡片里写的内容已经放进提纲了，不用再讲一遍。看看哪一处还单薄，比如某个要点缺“为什么”或例子，挑一处和我说说；觉得够了就直接开始写作。';
/** Only project our fixed templates; never rewrite actual student/coach dialogue. */
export function openingForDisplay(message: CoachMessage, type: Prompt['questionType']): CoachMessage {
 return message.role === 'coach' && message.action === 'opening' && (message.content === legacyPrewriteOpening || Object.values(openings).includes(message.content)) ? { ...message, content: prewriteOpening(type) } : message;
}
export function outlineGroups(type: Prompt['questionType'] = 'agree_disagree') {
 const titles: Record<Prompt['questionType'], string[]> = {
  agree_disagree: ['立场','理由一','理由二','反方思考（可选）'],
  discuss_both: ['自己的看法','观点一','观点二','自己的理由（可选）'],
  adv_disadv: ['整体判断','好处','坏处','权衡（可选）'],
  problem_solution: ['整体回答','问题或原因','对策','补充思考（可选）'],
  two_part: ['整体回答','问题一','问题二','补充思考（可选）'],
 };
 const labels=titles[type];
 return [
  {title:labels[0],slots:[{path:'stance',label:null}]},
  ...[0,1].map(i=>({title:labels[i+1],slots:[{path:`reasons.${i}.claim`,label:type==='two_part'?'回答':'要点'},{path:`reasons.${i}.why`,label:'为什么'},{path:`reasons.${i}.example`,label:'例子'}]})),
  {title:labels[3],slots:[{path:'counter.view',label:counterLabels[type][0]},{path:'counter.response',label:counterLabels[type][1]}]},
 ];
}
const counterLabels: Record<Prompt['questionType'], [string, string]> = {
 agree_disagree: ['另一种看法','你的回应'],
 discuss_both: ['为什么这样看','补充说明'],
 adv_disadv: ['比较依据','补充说明'],
 problem_solution: ['还要考虑什么','补充说明'],
 two_part: ['还要考虑什么','补充说明'],
};
/** What each outline path means for this task type; sent to the coach so ideas land in the matching slot. */
export function outlineGuide(type: Prompt['questionType'] = 'agree_disagree'): Record<string, string> {
 return Object.fromEntries(outlineGroups(type).flatMap(group => group.slots.map(slot => [slot.path, slot.label ? `${group.title} · ${slot.label}` : group.title])));
}
