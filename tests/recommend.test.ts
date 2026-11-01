import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendInTopic, type RecommendInput, type AttemptView } from '../lib/rules/recommend';
import { practiceCounts } from '../lib/rules/practice';
const q = {id:'q', exposureKey:'f', primaryTopic:'topic', questionType:'agree', bankOrder:1, pool:'practice'};
const base:RecommendInput={topic:'topic',questions:[q],attempts:[],completions:[],familiarity:[],continuations:[],quickEnabled:true};
const attempt:AttemptView={id:'a',questionId:'q',exposureKey:'f',activity:'quick',lifecycle:'open',createdAt:'2026-10-01',lastStudentActionAt:'2026-10-02',completed:false,activeRevision:false,cardState:'draft',hasCard:true};
const event={attemptId:'done',activity:'deep',exposureKey:'f',primaryTopic:'topic',questionType:'agree',completedAt:'2026-10-01',evidenceDeleted:false};
test('Untouched topic: Quick enabled recommends Quick, disabled recommends Deep and excludes readonly Quick',()=>{
 assert.equal(recommendInTopic(base).kind,'new');
 const r=recommendInTopic({...base,quickEnabled:false,attempts:[attempt]});assert.equal(r.kind,'new');if(r.kind==='new'){assert.equal(r.activity,'deep');assert.equal(r.focus,null);assert.equal(r.continueFromQuickId,null);}
});
test('Passed card edited and two drafts on one question resume latest student-edited attempt',()=>{
 const r=recommendInTopic({...base,attempts:[attempt,{...attempt,id:'b',completed:true,cardState:'unchecked',lastStudentActionAt:'2026-10-03'}]});assert.deepEqual(r,{kind:'resume',attemptId:'b'});
});
test('Set aside and active optional revision block all new-work branches; reserved work excluded',()=>{
 assert.equal(recommendInTopic({...base,attempts:[{...attempt,lifecycle:'set_aside'}]}).kind,'empty');
 assert.equal(recommendInTopic({...base,attempts:[{...attempt,activity:'deep',completed:true,activeRevision:true}],completions:[event]}).kind,'empty');
 assert.deepEqual(recommendInTopic({...base,questions:[{...q,pool:'checkpoint_reserved'}],attempts:[attempt]}),{kind:'empty',reason:'no_practice_questions'});
});
test('Exhausted topic rotates oldest latest completion and retains deleted source link',()=>{
 const r=recommendInTopic({...base,completions:[{...event,evidenceDeleted:true}]});assert.equal(r.kind,'rewrite');if(r.kind==='rewrite'){assert.equal(r.sourceDeleted,true);assert.equal(r.rewriteOfDeepId,'done');}
 assert.equal(recommendInTopic({...base,completions:[{...event,completedAt:null}]}).kind,'new');
});
test('Type breadth counts family once across activities and rewrites, tie by bank order',()=>{
 const r=recommendInTopic({...base,questions:[q,{...q,id:'q2',exposureKey:'f2',questionType:'discuss',bankOrder:2}],completions:[{...event,primaryTopic:'other'},{...event,attemptId:'again',activity:'quick'}]});assert.equal(r.kind,'new');if(r.kind==='new')assert.equal(r.questionId,'q2');
});
test('Deleted default child requires explicit new; closed passed card remains reusable',()=>{
 const r=recommendInTopic({...base,familiarity:[{exposureKey:'f'}],completions:[{...event,activity:'quick'}],attempts:[{...attempt,completed:true,cardState:'passed',lifecycle:'closed'}],continuations:[{quickAttemptId:'a',deepAttemptId:'deleted'}]});assert.equal(r.kind,'new');if(r.kind==='new'){assert.equal(r.needsExplicitNew,true);assert.equal(r.continueFromQuickId,'a');}
});
test('Quick Sunday, continued Deep Monday: Taipei event weeks, unknown dates and deleted evidence',()=>{
 const r=practiceCounts([{...event,completedAt:'2026-11-01T15:59:59Z',activity:'quick'},{...event,completedAt:'2026-11-01T16:00:00Z',evidenceDeleted:true},{...event,completedAt:null}],new Date('2026-11-02T01:00:00Z'));assert.deepEqual(r,{weekCompleted:1,unknownDate:1,completedFamilies:1});
});
