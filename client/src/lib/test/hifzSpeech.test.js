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
test('a benign browser-side end restarts listening automatically (field evidence: Arabic/ar-SA continuous sessions end on their own after a short pause even with continuous=true -- without an automatic restart the mic silently stops mid-recitation while the reciter keeps going, unnoticed)',()=>{
  const {states,r}=setup();
  r.onend();
  const r2=Recognition.instances.at(-1);
  assert.notEqual(r2,r); // eine frische Recognition-Instanz wurde gestartet
  assert.equal(states.some(s=>s[0]==='paused'),false); // fürs UI unbemerkt
  assert.equal(states.at(-1)[0],'listening');
});
test('the explicit stop() (Pause button) is never overridden by an automatic restart',()=>{
  const {adapter,states,r}=setup();
  const before=states.length;
  adapter.stop();
  assert.equal(r.onend,null); // stop() trennt die Handler -- kein onend kann mehr feuern
  assert.equal(adapter.recognition,null);
  assert.deepEqual(states.slice(before),[]); // kein neuer Zustand, kein Neustart
});
test('automatic restarts are capped to avoid a tight loop on a persistently broken device',()=>{
  const {adapter,states}=setup();
  const before=Recognition.instances.length;
  for (let i=0;i<10;i++) Recognition.instances.at(-1).onend();
  // Höchstens 6 automatische Neustarts (+ die ursprüngliche Instanz), dann
  // wird ehrlich aufgegeben statt endlos weiterzuversuchen.
  assert.equal(Recognition.instances.length-before,6);
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
