import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NewEssayButton } from '../../components/shell/new-essay';
const router = { bfcacheId:'test',back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{} };
function render(bankEnabled:boolean){return renderToStaticMarkup(createElement(AppRouterContext.Provider,{value:router},createElement(NewEssayButton,{bankEnabled})));}
test('New essay with bank enabled navigates to real topic selection instead of opening legacy random-task dialog',()=>{
 const html=render(true);assert.match(html,/<a\b[^>]*href="\/#topics"/);assert.match(html,/新建作文/);assert.doesNotMatch(html,/aria-haspopup="dialog"/);
});
test('New essay with bank disabled preserves legacy dialog trigger',()=>{
 const html=render(false);assert.match(html,/aria-haspopup="dialog"/);assert.doesNotMatch(html,/href="\/#topics"/);assert.match(html,/新建作文/);
});
