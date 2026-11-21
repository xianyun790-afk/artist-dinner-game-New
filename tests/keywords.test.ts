import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectKeyword} from '../src/lib/keywords.ts';
import {enterConversation,freeTalk,freshSave} from '../src/lib/engine.ts';
import {artists} from '../src/lib/artists.ts';
test('keywords offer only contextually relevant optional activities',()=>{
  assert.equal(detectKeyword('要不要一起画一张？'),'art');assert.equal(detectKeyword('我想看看作品'),'works');assert.equal(detectKeyword('邀请朋友一起坐坐'),'invite');assert.equal(detectKeyword('今天心情不错'),null);
});
test('negated speech never opens an activity suggestion',()=>{
  for(const text of ['不想一起画','别打开作品','不用邀请朋友','我不需要作品夹','不要调整声音'])assert.equal(detectKeyword(text),null,text);
  assert.equal(detectKeyword('今天不想一起画，看看作品吧'),'works');
});
test('free conversation does not force the player into a guided creation branch',()=>{
  const a=artists[1];const s=freeTalk(enterConversation(freshSave(),a),a,'想一起画一张');assert.equal(s.people[a.id].node,'hello');assert.equal(s.works.length,0);
});
test('insults can irritate, a reasoned difference does not, and repair calms the person',()=>{
  const a=artists[1];let s=enterConversation(freshSave(),a);s=freeTalk(s,a,'我不同意');assert.equal(s.people[a.id].mood,'curious');s=freeTalk(s,a,'你必须听我的');s=freeTalk(s,a,'闭嘴');assert.equal(s.people[a.id].mood,'irritated');s=freeTalk(s,a,'抱歉，我说重了');assert.equal(s.people[a.id].mood,'calm');
});
