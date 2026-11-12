import type { ReasonParts } from '@/lib/rules/recommend';
export function RecommendationReason({ reason }: { reason: ReasonParts }) { return <p className="text-[15px] text-muted-foreground">{reason.branch==='exhausted' ? '这个主题的题目都精练过了，重写隔得最久的一题。' : reason.branch==='untouched' ? '这道题还没有开始过。' : '这道题还没有完成过精练。'}{reason.leastPractisedType && '这类题型你练得比较少。'}</p>; }
