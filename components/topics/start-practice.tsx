'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { StatusButton } from '@/components/ui/status-button';
export function StartPractice({ questionId, activity, rewriteOfDeepId, continueFromQuickId, explicitNew=false, variant='default', size, className, wrapperClassName, children }: {variant?:'default'|'outline'|'ghost'; size?:'default'|'sm'|'lg'; className?:string; wrapperClassName?:string; questionId:string; activity:'quick'|'deep'; rewriteOfDeepId?:string; continueFromQuickId?:string|null; explicitNew?:boolean; children:React.ReactNode}) {
 const [busy,setBusy]=useState(false), [error,setError]=useState(''); const key=useRef<string|null>(null); const router=useRouter();
 async function start(){setBusy(true);setError(''); key.current ??=crypto.randomUUID();try{
 const r=await fetch(continueFromQuickId ? `/api/sessions/${continueFromQuickId}/actions` : '/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(continueFromQuickId ? {action:'continueDeep',explicitNew,idempotencyKey:key.current} : {questionId,activity,mode:'practice',idempotencyKey:key.current,...(rewriteOfDeepId?{rewriteOfDeepId}:{})})});
 const data=await r.json();if(!r.ok)throw new Error(data.error?.message||data.error||'开始失败，请重试。'); const id=data.deepSession?.id||data.session?.id;router.push(`/essays/${id}`);
 }catch(e){setError(e instanceof Error?e.message:'开始失败');setBusy(false);}}
 return <span className={wrapperClassName ?? "inline-flex flex-col gap-2"}><StatusButton variant={variant} size={size} className={className} status={busy?'pending':'idle'} pendingLabel='正在打开' onClick={start}>{children}</StatusButton>{error&&<span role="alert" className="motion-reveal text-sm text-destructive">{error}</span>}</span>;
}
