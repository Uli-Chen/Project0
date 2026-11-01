import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { OutlineBoard } from '../../components/outline/outline-board';
import { CoachTab } from '../../components/essay/coach-tab';
import { EssayUiProvider } from '../../components/essay/essay-ui';
import { SessionProvider } from '../../lib/prototype/session-store';
import { createSession } from '../../lib/pipeline/initial';
import { legacyPrewriteOpening, openingForDisplay, outlineGroups, prewriteOpening } from '../../lib/learning/prewrite-guidance';
import type { CoachMessage, Prompt } from '../../lib/prototype/types';

test('Two-question outline labels answer each question without imposing stance or counterargument; stored paths remain compatible',()=>{
 const state=createSession({kind:'free',mode:'practice'});
 const html=renderToStaticMarkup(createElement(OutlineBoard,{outline:state.outline,questionType:'two_part',onEdit(){}}));
 for(const label of ['整体回答','问题一','问题二','补充思考（可选）'])assert.ok(html.includes(label));
 assert.doesNotMatch(html,/立场|反方|他们会说|你的回应/);
 const paths=outlineGroups().flatMap(g=>g.slots.map(s=>s.path));
 for(const type of ['agree_disagree','discuss_both','adv_disadv','problem_solution','two_part'] as Prompt['questionType'][])assert.deepEqual(outlineGroups(type).flatMap(g=>g.slots.map(s=>s.path)),paths);
});
test('Fixed legacy opening is projected by authoritative question type without changing historical message or custom dialogue',()=>{
 const message:CoachMessage={id:'opening',role:'coach',stage:'prewriting',action:'opening',content:legacyPrewriteOpening};
 assert.match(openingForDisplay(message,'two_part').content,/两个问题/);assert.equal(message.content,legacyPrewriteOpening);
 const custom={...message,content:'你刚才提到的原因会带来什么影响？'};assert.equal(openingForDisplay(custom,'two_part'),custom);
 assert.doesNotMatch(prewriteOpening('two_part'),/立场/);
});
test('Set-aside prewriting keeps composer mounted but disables writing actions and adapts opening',()=>{
 const state=createSession({kind:'free',mode:'practice'});state.lifecycle='set_aside';state.prompt.questionType='two_part';state.messages[0].content=legacyPrewriteOpening;state.outline.stance={text:'分别讨论原因和影响',sources:['user']};
 const html=renderToStaticMarkup(jsx(SessionProvider,{initialState:state,children:jsx(EssayUiProvider,{children:jsx(CoachTab,{onAccept(){},onUndo(){},notices:{}})})}));
 assert.match(html,/两个问题/);assert.doesNotMatch(html,/你的立场是什么/);
 assert.match(html,/<textarea\b/);
 const startButton=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match=>match[2].includes('开始写作'));
 assert.ok(startButton);assert.match(startButton[1],/(?:^|\s)disabled(?:\s|=|$)/);
});
