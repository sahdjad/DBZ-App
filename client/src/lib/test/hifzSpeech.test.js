import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSpeech } from '../hifzSpeech.js';
class Recognition {
  static instances=[];
  constructor(){Recognition.instances.push(this);this.lang=null;}
  start(){this.onstart?.();}
  abort(){this.aborted=true;}
}
const result=(text,final=true)=>Object.assign([{transcript:text}],{isFinal:final});
function setup(){
  const segments=[],states=[],interims=[];
  const adapter=new BrowserSpeech({recognitionClass:Recognition,onSegment:s=>segments.push(s),onState:(...s)=>states.push(s),onInterim:t=>interims.push(t)});
  adapter.start(1);
  return {adapter,segments,states,interims,r:Recognition.instances.at(-1)};
}
test('only new final results emitted',()=>{
  const {segments,r}=setup();r.onresult({resultIndex:0,results:[result('x',false)]});
  assert.equal(segments.length,0);
  r.onresult({resultIndex:0,results:[result('x')]});
  r.onresult({resultIndex:0,results:[result('x'),result('y')]});
  assert.deepEqual(segments.map(s=>s.text),['x','y']);
});
test('captured callback from prior run ignored',()=>{
  const {adapter,segments,r}=setup();const old=r.onresult;
  adapter.start(2);old({resultIndex:0,results:[result('x')]});
  assert.equal(segments.length,0);assert.equal(r.aborted,true);
});
test('stop invalidates pending callbacks and detaches handlers',()=>{
  const {adapter,segments,r}=setup();const old=r.onresult;adapter.stop();
  old({resultIndex:0,results:[result('x')]});assert.equal(segments.length,0);
  assert.equal(r.onresult,null);assert.equal(r.aborted,true);
});
test('end pauses without automatic microphone restart',()=>{
  const {adapter,states,r}=setup();r.onend();assert.equal(adapter.recognition,null);
  assert.equal(states.at(-1)[0],'paused');
});
test('permission error aborts and reports meaningful state',()=>{
  const {states,r}=setup();r.onerror({error:'not-allowed'});
  assert.deepEqual(states.at(-1),['error','not-allowed']);assert.equal(r.aborted,true);
});
test('each recording run has distinct segment IDs',()=>{
  const {adapter,segments,r}=setup();r.onresult({resultIndex:0,results:[result('x')]});
  adapter.start(1);Recognition.instances.at(-1).onresult({resultIndex:0,results:[result('y')]});
  assert.notEqual(segments[0].id,segments[1].id);
});
test('interim (non-final) results only feed live UI feedback, never segments',()=>{
  const {segments,interims,r}=setup();
  r.onresult({resultIndex:0,results:[result('كتا',false)]});
  assert.equal(segments.length,0);assert.deepEqual(interims.at(-1),'كتا');
});
test('interim buffer clears on stop and on end',()=>{
  const {adapter,interims,r}=setup();
  r.onresult({resultIndex:0,results:[result('كتا',false)]});
  adapter.stop();
  assert.deepEqual(interims.slice(-2),['كتا','']);
});
test('unsupported language falls back once to the plain code, then keeps listening',()=>{
  const {states,r}=setup();
  assert.equal(r.lang,'ar-SA');
  r.onerror({error:'language-not-supported'});
  const r2=Recognition.instances.at(-1);
  assert.notEqual(r2,r);assert.equal(r2.lang,'ar');
  assert.equal(states.some(s=>s[0]==='error'),false);
});
test('unsupported language reports error once both codes fail',()=>{
  const {states,r}=setup();
  r.onerror({error:'language-not-supported'});
  Recognition.instances.at(-1).onerror({error:'language-not-supported'});
  assert.deepEqual(states.at(-1),['error','language-not-supported']);
});
