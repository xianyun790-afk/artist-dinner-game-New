import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists } from '../src/lib/artists.ts';
import { choose, clearMemories, enterConversation, freeTalk, freshSave, makeMark, nextNight, saveWork } from '../src/lib/engine.ts';
import type { Artist, Save } from '../src/lib/types.ts';
const vincent=artists.find(a=>a.id==='vincent')!;
function drawing(a:Artist=vincent){let s=enterConversation(freshSave(),a);s=choose(s,a,'create');return choose(s,a,'accept');}
function completed(a:Artist=vincent){let s=makeMark(drawing(a),a,'heavy');s=choose(s,a,'keep');return saveWork(s,a,'两个人一起推');}

test('every selectable artist can complete an independently attributed private work',()=>{
  for(const a of artists){const s=completed(a);assert.equal(s.works.length,1);assert.equal(s.works[0].artistId,a.id);assert.equal(s.works[0].shared,false);assert.equal(s.people[a.id].node,'saved');assert.ok(s.people[a.id].memories.some(m=>m.workId===s.works[0].id));}
});
test('a reasoned disagreement increases engagement without becoming irritation',()=>{
  let s=makeMark(drawing(),vincent,'light');s=choose(s,vincent,'explain');assert.equal(s.people.vincent.mood,'curious');assert.equal(s.people.vincent.irritation,0);s=choose(s,vincent,'keepDifference');s=saveWork(s,vincent,'这里停一下');assert.equal(s.works[0].disagreement,true);assert.ok(s.people.vincent.evidence.includes('reasoned-dialogue'));
});
test('an ambiguous dismissive remark can be clarified before any escalation',()=>{
  let s=makeMark(drawing(),vincent,'light');s=choose(s,vincent,'dismiss');assert.equal(s.people.vincent.node,'warning');assert.notEqual(s.people.vincent.mood,'irritated');s=choose(s,vincent,'clarify');assert.equal(s.people.vincent.irritation,0);assert.equal(s.people.vincent.node,'disagreement');assert.equal(s.works.length,0);
});
test('insisting after a reminder pauses the topic; cooling off never fabricates a work',()=>{
  let s=makeMark(drawing(),vincent,'circle');s=choose(s,vincent,'dismiss');s=choose(s,vincent,'insist');assert.equal(s.people.vincent.mood,'irritated');assert.equal(s.people.vincent.node,'paused');s=choose(s,vincent,'cool');assert.equal(s.people.vincent.mood,'calm');assert.equal(s.works.length,0);
});
test('saveWork is idempotent when its button is submitted twice',()=>{
  const s=completed();const again=saveWork(s,vincent,'重复');assert.equal(again.works.length,1);assert.equal(again.works[0].title,'两个人一起推');
});
test('private works and conversations do not leak to another artist',()=>{
  const s=enterConversation(completed(),artists[0]);assert.equal(s.people.monet.memories.length,0);assert.ok(!s.people.monet.messages.some(m=>m.text.includes('两个人一起推')));assert.ok(s.people.vincent.memories.length>0);
});
test('a new evening recalls saved work but begins with a calm mood',()=>{
  const s=enterConversation(nextNight(completed()),vincent);assert.equal(s.night,2);assert.equal(s.people.vincent.mood,'calm');assert.ok(s.people.vincent.messages[0].text.includes('两个人一起推'));
});
test('deleting a memory prevents artwork callbacks without deleting the actual work',()=>{
  const s=enterConversation(nextNight(clearMemories(completed(),vincent.id)),vincent);assert.equal(s.works.length,1);assert.equal(s.people.vincent.memories.length,0);assert.ok(!s.people.vincent.messages[0].text.includes('两个人一起推'));
});
test('declining an exercise remains a boundary remembered on the next visit',()=>{
  let s=enterConversation(freshSave(),vincent);s=choose(s,vincent,'create');s=choose(s,vincent,'decline');assert.equal(s.people.vincent.evidence.length,0);s=enterConversation(nextNight(s),vincent);assert.ok(s.people.vincent.messages[0].text.includes('不追问'));
});
test('repeated free text cannot farm relationship evidence',()=>{
  let s=enterConversation(freshSave(),vincent);s=freeTalk(s,vincent,'你是最好的艺术家');const before=s.people.vincent.evidence.length;s=freeTalk(s,vincent,'你是最好的艺术家');assert.equal(s.people.vincent.evidence.length,before);assert.ok(s.people.vincent.messages.at(-1)?.text.includes('刚才说过'));
});
test('a completely custom solo guest can complete the same gameplay loop',()=>{
  const a={...artists[4],id:'custom-test',name:'纸灯',greeting:'我想和你一起看看纸的边缘。',observation:'看这个缺口。'};let s:Save=freshSave();s.invited=[a.id];s.customArtists=[a];s=enterConversation(s,a);s=choose(s,a,'create');s=choose(s,a,'accept');s=makeMark(s,a,'free',['M 10 10 L 30 20']);s=choose(s,a,'keep');s=saveWork(s,a,'纸边');assert.equal(s.works[0].artistId,a.id);assert.equal(s.works[0].paths[0],'M 10 10 L 30 20');assert.equal(s.invited.length,1);
});

test('everyday opinions and preferences neither congratulate the artist nor invent an art disagreement',()=>{
  for(const a of artists){
    for(const input of ['我觉得面有点咸。','我喜欢吃面。','你想吃什么？']){
      const p=freeTalk(enterConversation(freshSave(),a),a,input).people[a.id];
      assert.equal(p.mood,'calm',`${a.name}: ${input}`);assert.equal(p.irritation,0);
      assert.deepEqual(p.evidence,[]);assert.ok(p.messages.at(-1)?.text);
      assert.notEqual(p.messages.at(-1)?.text,a.observation);assert.notEqual(p.messages.at(-1)?.text,a.disagreement);
      assert.doesNotMatch(p.messages.at(-1)!.text,/谢谢|各留一|颜色|笔触|配色|画纸/);
    }
  }
});

test('ordinary questions receive distinct short choices and reset the previous praise performance',()=>{
  const replies=artists.map(a=>freeTalk(enterConversation(freshSave(),a),a,'你想吃什么？').people[a.id].messages.at(-1)!.text);
  assert.equal(new Set(replies).size,artists.length);
  let s=freeTalk(enterConversation(freshSave(),vincent),vincent,'谢谢你');assert.equal(s.people.vincent.mood,'excited');
  s=freeTalk(s,vincent,'我喜欢吃面');assert.equal(s.people.vincent.mood,'calm');
  assert.doesNotMatch(s.people.vincent.messages.at(-1)!.text,/谢谢/);
});

test('not wanting to go out is not a silence request and declining creation permits a new everyday topic',()=>{
  for(const a of artists){
    for(const input of ['今天不想出门，只想和你聊电影。','今天不想一起画，想聊电影。']){
      const s=freeTalk(enterConversation(freshSave(),a),a,input),p=s.people[a.id];
      assert.equal(p.mood,'calm');assert.match(p.messages.at(-1)!.text,/哪一部|哪部电影/);
      assert.notEqual(p.messages.at(-1)!.text,a.quiet);assert.equal(s.works.length,0);assert.equal(p.node,'hello');
      assert.equal(p.memories.some(m=>m.kind==='boundary'),input.includes('一起画'));
    }
  }
});

test('requests for silence and for listening without advice keep their actual scope',()=>{
  for(const a of artists){
    for(const input of ['我想安静一会儿。','今天有点烦，别分析我，也别出主意，我就坐一会。']){
      const p=freeTalk(enterConversation(freshSave(),a),a,input).people[a.id];
      assert.equal(p.messages.at(-1)!.text,a.quiet);assert.equal(p.mood,'calm');
      assert.deepEqual(p.memories,[],'silence does not invent a remembered refusal to create');
    }
    const p=freeTalk(enterConversation(freshSave(),a),a,'今天好累，先别给建议，我想把话说完。').people[a.id];
    assert.match(p.messages.at(-1)!.text,/不出主意/);assert.doesNotMatch(p.messages.at(-1)!.text,/少做|歇着|先缓/);
  }
});

test('art criticism stays a disagreement while object descriptions do not become personal insults',()=>{
  for(const a of artists){
    const p=freeTalk(enterConversation(freshSave(),a),a,'我不喜欢你的画，配色太淡了。').people[a.id];
    assert.equal(p.mood,'curious');assert.equal(p.irritation,0);assert.equal(p.messages.at(-1)!.text,a.disagreement);
    assert.ok(p.evidence.includes('reasoned-dialogue'));
    let s=freeTalk(enterConversation(freshSave(),a),a,'这幅画的画框像垃圾桶。');
    s=freeTalk(s,a,'画里的垃圾桶有点歪。');assert.equal(s.people[a.id].irritation,0);
    s=freeTalk(s,a,'你真蠢。');s=freeTalk(s,a,'你就是垃圾。');assert.equal(s.people[a.id].irritation,2);assert.equal(s.people[a.id].mood,'irritated');
    s=freeTalk(s,a,'对不起，刚才说重了。');assert.equal(s.people[a.id].irritation,0);assert.equal(s.people[a.id].mood,'calm');
  }
});

test('bare disagreement asks about the point without fabricating a shared painting',()=>{
  const p=freeTalk(enterConversation(freshSave(),vincent),vincent,'我不同意。').people.vincent;
  assert.equal(p.mood,'curious');assert.match(p.messages.at(-1)!.text,/哪一点/);assert.doesNotMatch(p.messages.at(-1)!.text,/各留|画|笔/);
  const first=freeTalk(freshSave(),vincent,'这件事我还没说完');assert.equal(typeof first.people.vincent.messages.at(-1)!.text,'string');
});

test('ordinary clothing colours and room lighting do not invent art criticism or a canvas',()=>{
  for(const a of artists){
    for(const input of ['这件衣服颜色太淡了。','房间光线太暗了。']){
      const p=freeTalk(enterConversation(freshSave(),a),a,input).people[a.id];
      assert.equal(p.mood,'calm',input);assert.deepEqual(p.evidence,[]);assert.equal(p.irritation,0);
      assert.notEqual(p.messages.at(-1)!.text,a.observation);assert.notEqual(p.messages.at(-1)!.text,a.disagreement);
      assert.doesNotMatch(p.messages.at(-1)!.text,/画纸|画布|各留|第一笔|笔触/);
    }
    const p=freeTalk(enterConversation(freshSave(),a),a,'这幅画里的衣服颜色太淡了。').people[a.id];
    assert.equal(p.mood,'curious');assert.equal(p.messages.at(-1)!.text,a.disagreement);
    assert.ok(p.evidence.includes('reasoned-dialogue'));
  }
});
