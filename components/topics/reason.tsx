import type { ReasonParts } from '@/lib/rules/recommend';
export function RecommendationReason({ reason }: { reason: ReasonParts }) { return <p className="text-sm text-muted-foreground">{reason.branch==='exhausted' ? '本主题已全部完成精练，重写距离上次完成最久的一题。' : reason.branch==='untouched' ? '这道题还没有开始过。' : '这道题尚无已知日期的精练完成记录。'}{reason.leastPractisedType && '优先选择已完成题目家族较少的题型。'}</p>; }
