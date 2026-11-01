import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeaveConfirmation } from '../../components/quick/leave-confirmation';
for (const answerOnly of [false,true]) {
 test(`Quick in-page leave confirmation preserves a clear continue-editing choice (answerOnly=${answerOnly})`,()=>{
  const html=renderToStaticMarkup(createElement(LeaveConfirmation,{answerOnly,onCancel(){},onLeave(){}}));
  assert.match(html,/role="alertdialog"/);assert.match(html,/aria-labelledby="quick-leave-title"/);assert.match(html,/aria-describedby="quick-leave-description"/);
  assert.match(html,/继续编辑/);assert.match(html,answerOnly?/放弃未发送回答并打开作文/:/放弃未保存并离开/);
  assert.ok(html.indexOf('继续编辑') < html.indexOf(answerOnly?'放弃未发送回答并打开作文':'放弃未保存并离开'));
 });
}
test('Quick leave confirmation cannot dispatch navigation during a pending save',()=>{
 for (const disabled of [true, false]) {
  const html=renderToStaticMarkup(createElement(LeaveConfirmation,{disabled,onCancel(){},onLeave(){}}));
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.equal(buttons.length,2);
  for (const label of ['继续编辑','放弃未保存并离开']) {
   const button=buttons.find(match=>match[2].includes(label));
   assert.ok(button, `Missing ${label} button`);
   const hasNativeDisabled=/(?:^|\s)disabled(?:\s|=|$)/.test(button[1]);
   assert.equal(hasNativeDisabled,disabled, `${label}: native disabled attribute`);
  }
 }
});
