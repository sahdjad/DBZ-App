import test from 'node:test';
import assert from 'node:assert/strict';
import { HifzEngine, normalize, validatePassage } from '../hifzEngine.js';
// Neutral Arabic words, NOT Quran fixtures or a Quran source.
const passage = (tokens = ['كتاب', 'قلم', 'باب', 'بيت']) => ({
  id:'test', title:'Technischer Test', edition:'test', riwaya:'test', source:'synthetic non-Quran',
  words:tokens.map((text,i)=>({ id:`test:${i}`, surah:1,ayah:1,position:i+1,line:1,text }))
});
function send(e, text, id = `s${e.seen.size}`, extra = {}) {
  return e.accept({session:e.session,id,final:true,text,...extra});
}
test('matching final tokens advance in order',()=>{
  const e=new HifzEngine(passage()); assert.equal(send(e,'كتاب قلم').index,2);
  assert.equal(send(e,'باب بيت').status,'complete');
});
test('interim transcript never reveals',()=>{
  const e=new HifzEngine(passage()); assert.equal(send(e,'كتاب قلم','x',{final:false}).index,0);
  assert.equal(send(e,'كتاب','x').index,1);
});
test('duplicate event is ignored',()=>{
  const e=new HifzEngine(passage()); send(e,'كتاب','x'); assert.equal(send(e,'قلم','x').index,1);
});
test('old session cannot mutate reset session',()=>{
  const e=new HifzEngine(passage()); const session=e.session; e.reset();
  assert.equal(send(e,'كتاب','x',{session}).index,0);
});
test('does not jump past omitted word',()=>{
  const e=new HifzEngine(passage()); assert.equal(send(e,'كتاب باب بيت').index,1);
});
test('self correction resumes without skipping',()=>{
  const e=new HifzEngine(passage()); send(e,'كتاب خطأ');
  assert.equal(send(e,'قلم باب').index,3);
});
test('unambiguous suffix repetition is allowed',()=>{
  const e=new HifzEngine(passage()); send(e,'كتاب قلم');
  assert.equal(send(e,'كتاب قلم باب').index,3);
});
test('identical adjacent words remain conservative',()=>{
  const e=new HifzEngine(passage(['كتاب','كتاب','باب'])); send(e,'كتاب');
  const s=send(e,'كتاب'); assert.equal(s.index,1); assert.equal(s.status,'uncertain');
});
test('one mismatch is uncertain, second is suspected, never certified',()=>{
  const e=new HifzEngine(passage()); assert.equal(send(e,'خطأ').status,'uncertain');
  assert.equal(send(e,'خطأ').status,'suspected'); assert.equal(e.index,0);
});
test('dismissal prevents repeated red flag at same position',()=>{
  const e=new HifzEngine(passage()); send(e,'خطأ');send(e,'خطأ');e.dismissMismatch();
  send(e,'خطأ'); assert.equal(send(e,'خطأ').status,'uncertain');
  assert.equal(send(e,'كتاب').index,1);
});
test('hint does not advance and subsequent match is assisted',()=>{
  const e=new HifzEngine(passage()); assert.equal(e.hint().index,0);e.hint();
  const s=send(e,'كتاب'); assert.equal(s.hints.length,1);
  assert.ok(s.history.some(x=>x.kind==='assisted-match'));
});
test('empty or unreliable speech does not count as a mistake',()=>{
  const e=new HifzEngine(passage());send(e,'   ');send(e,'كتاب','b',{reliable:false});
  assert.equal(e.index,0);assert.equal(e.mismatch,null);
});
test('original text is preserved; vowel changes not graded',()=>{
  const p=passage(['كِتَاب']);const e=new HifzEngine(p);
  assert.equal(e.passage.words[0].text,'كِتَاب');assert.equal(send(e,'كتاب').index,1);
});
test('hamza-bearing letter forms are folded for comparison (ASR rarely reproduces them), display text is untouched',()=>{
  assert.equal(normalize('أمل'),normalize('امل'));
  const p=passage(['أمل']);const e=new HifzEngine(p);
  assert.equal(e.passage.words[0].text,'أمل'); // Mushaf-Schreibweise bleibt auf dem Bildschirm erhalten
  assert.equal(send(e,'امل').index,1); // Erkennungstext ohne Hamza zählt trotzdem als Treffer
});
test('alif maqsura and hamza-on-waw/ya are folded for comparison too',()=>{
  assert.equal(normalize('على'),normalize('علي'));
  assert.equal(normalize('سؤال'),normalize('سوال'));
  assert.equal(normalize('سئل'),normalize('سيل'));
});
test('ta marbuta is folded to ha for comparison (ASR transcripts routinely write it as ه)',()=>{
  assert.equal(normalize('رحمة'),normalize('رحمه'));
  const p=passage(['رحمة']);const e=new HifzEngine(p);
  assert.equal(e.passage.words[0].text,'رحمة'); // Mushaf-Schreibweise bleibt erhalten
  assert.equal(send(e,'رحمه').index,1);
});
test('a single mis-heard letter within a long-enough word is still accepted (bounded edit distance)',()=>{
  const p=passage(['العالمين']);const e=new HifzEngine(p);
  assert.equal(send(e,'العالمون').index,1); // ein Buchstabe abweichend, sonst identisch
});
test('two or more mis-heard letters are NOT tolerated (would risk accepting a different word)',()=>{
  const p=passage(['العالمين']);const e=new HifzEngine(p);
  const s=send(e,'العاصفين'); // zwei Buchstaben abweichend
  assert.equal(s.index,0); assert.equal(s.status,'uncertain');
});
test('short words (<=3 letters) are never fuzzy-matched, only exact',()=>{
  const p=passage(['من']);const e=new HifzEngine(p);
  const s=send(e,'عن'); // ein Buchstabe abweichend, aber ein komplett anderes, kurzes Wort
  assert.equal(s.index,0); assert.equal(s.status,'uncertain');
});
test('a single stray extra word in the transcript is ignored, not a mistake',()=>{
  const e=new HifzEngine(passage()); // كتاب قلم باب بيت
  const s=send(e,'كتاب اه قلم باب بيت');
  assert.equal(s.status,'complete'); assert.equal(s.index,4);
  assert.ok(s.history.some(x=>x.kind==='insertion-ignored'));
  assert.ok(!s.history.some(x=>x.kind==='transcript-deviation'));
});
test('a stray word too far ahead is not skipped (bounded lookahead)',()=>{
  const p=passage(['كتاب','قلم','باب','بيت','شجرة']);
  const e=new HifzEngine(p);
  // 4 fremde Wörter vor "بيت" liegen außerhalb des Toleranzfensters (3).
  const s=send(e,'كتاب قلم باب و و و و بيت');
  assert.equal(s.index,3); // كتاب, قلم, باب erkannt; Rest bleibt ein echter Fehler
  assert.notEqual(s.status,'complete');
});
test('a genuinely missing word is still never skipped (no false insertion-resync)',()=>{
  const e=new HifzEngine(passage()); // كتاب قلم باب بيت
  const s=send(e,'كتاب باب بيت'); // "قلم" ausgelassen
  assert.equal(s.index,1);
  assert.ok(!s.history.some(x=>x.kind==='insertion-ignored'));
  assert.equal(s.status,'uncertain');
});
test('duplicate IDs, malformed and unordered data rejected',()=>{
  const p=passage();p.words[1].id=p.words[0].id;assert.throws(()=>validatePassage(p));
  const p2=passage();p2.words[2].position=9;assert.throws(()=>validatePassage(p2));
  assert.throws(()=>validatePassage({}));
});
test('completion cannot be advanced further',()=>{
  const e=new HifzEngine(passage(['كتاب']));send(e,'كتاب');assert.equal(send(e,'قلم').index,1);
});
