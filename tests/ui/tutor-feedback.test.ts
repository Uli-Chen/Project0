import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackTab } from "../../components/essay/feedback-tab";
import { EssayUiProvider } from "../../components/essay/essay-ui";
import { SessionProvider } from "../../lib/prototype/session-store";
import { createSession } from "../../lib/pipeline/initial";
import { SuggestionCard } from "../../components/coach/suggestion-card";
import type { Evaluation } from "../../lib/prototype/types";
function render(count:number,enabled=true,mode:"practice"|"mock"="practice",closed=false) {
 const state=createSession({kind:"free",mode});state.stage="feedback";state.submitted.original="This is the frozen sentence.";state.drafts.original="Unsaved different sentence.";if(closed)state.lifecycle="closed";
 state.evaluation={scores:{overall:6,dims:{TR:6,CC:6,LR:6,GRA:6},rationale:{TR:"r",CC:"r",LR:"r",GRA:"r"}},issues:Array.from({length:count},(_,index)=>({rank:index+1,code:"grammar",title:`Problem ${index+1}`,why:"Reason",sentenceIds:[1],hintL1:"Hint",recurring:false})),review:{outlineCoverage:[],breakthrough:null,focusResult:null,selfReportContrast:null,aiRatio:0}} satisfies Evaluation;
 return renderToStaticMarkup(jsx(SessionProvider,{initialState:state,tutorV2Enabled:enabled,children:jsx(EssayUiProvider,{children:jsx(FeedbackTab,{})})}));
}
test("new feedback prioritizes one problem once, quotes frozen submission, folds others",()=>{
 const html=render(3);assert.equal(html.split("改这个问题").length-1,1);assert.match(html,/Problem 1/);assert.doesNotMatch(html,/Problem 2|Problem 3/);assert.match(html,/还有 2 个问题/);assert.match(html,/This is the frozen sentence/);assert.doesNotMatch(html,/Unsaved different sentence/);
});
test("no issues, single issue, mock and closed practice render sensible controls",()=>{
 assert.doesNotMatch(render(0),/改这个问题|还有/);assert.doesNotMatch(render(1),/还有/);assert.match(render(1,true,"mock"),/模考成绩/);
 assert.match(render(1,true,"practice",true),/<button[^>]*disabled[^>]*>改这个问题<\/button>/);
});
test("flag off retains all existing issue details without the new primary action",()=>{const html=render(3,false);assert.match(html,/Problem 2/);assert.match(html,/Problem 3/);assert.doesNotMatch(html,/改这个问题|还有 2 个问题/);});
test("example cards show insertion semantics and can disable acceptance while leaving dismissal enabled",()=>{
 const html=renderToStaticMarkup(jsx(SuggestionCard,{suggestion:{id:"e",type:"example",selectionText:"",suggestedText:"Student supplied sentence.",reason:"Explanation",status:"pending"},onAccept:()=>{},onDismiss:()=>{},acceptDisabled:true}));
 assert.match(html,/<button[^>]*disabled[^>]*>插入到光标处<\/button>/);assert.match(html,/>忽略<\/button>/);assert.match(html,/Student supplied sentence/);
});
