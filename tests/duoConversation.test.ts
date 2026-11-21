import assert from 'node:assert/strict';
import test from 'node:test';
import { statSync } from 'node:fs';
import { artists } from '../src/lib/artists.ts';
import { duoMembers, duoScript, parseDuoRequest, playDuoConversation, recordedExchanges } from '../src/lib/duoConversation.ts';
import { dialogueBody } from '../src/lib/dialogueService.ts';

const pair = duoMembers(artists, ['梵高', '达利'])!;
test('only direct pair invitations enter duo mode and the requested pair must be present', () => {
  for (const cue of ['听他们聊', '你们俩聊聊吧', '他俩进行对话吧']) assert.deepEqual(parseDuoRequest(cue),{named:[],topic:''});
  assert.deepEqual(parseDuoRequest('请梵高和达利一起聊聊，星空吧。'),{named:['梵高','达利'],topic:'星空'});
  assert.deepEqual(parseDuoRequest('你俩聊聊周末去哪儿'),{named:[],topic:'周末去哪儿'});
  for (const cue of ['聊聊星空','先别让他俩聊天','你们聊天的时候会做什么？','梵高和达利见过面吗']) assert.equal(parseDuoRequest(cue),null);
  assert.equal(duoMembers([pair[0]]),null);
  assert.equal(duoMembers([pair[1]],['梵高','达利']),null);
  assert.equal(duoMembers(artists,['梵高','梵高']),null);
});
test('both default exchanges alternate authors with a separate archived recording per turn', () => {
  for (const [i,scene] of recordedExchanges.entries()) {
    assert.equal(duoScript(pair,'',i),scene);
    for (const alias of scene.topics) assert.equal(duoScript(pair,alias,i+1),scene);
    assert.equal(scene.lines.length,4);
    scene.lines.forEach((line,index) => {
      assert.notEqual(line.artistId,scene.lines[index-1]?.artistId);
      assert.ok(statSync(new URL('../public'+line.audio,import.meta.url)).size>3000);
    });
  }
  assert.equal(duoScript(pair,'下雨天要不要去散步',0),undefined);
  assert.equal(duoScript(duoMembers(artists,['莫奈','达利'])!,'星空',0),undefined);
});
test('live partners receive each preceding actual line, and interruption discards subsequent turns', async () => {
  const ac=new AbortController(), heard:string[]=[];
  const incoming:string[][]=[];
  await playDuoConversation(pair,'要不要散步',undefined,ac.signal,{
    generate:async(reply, direction, history)=>{
      assert.ok(direction.includes('要不要散步'));
      incoming.push(history.map(line=>line.name+line.text));
      return reply.artist.id==='vincent'?'先过桥。':'那我在桥头等你。';
    },
    thinking:()=>{},present:r=>heard.push(r.text),
    speak:async()=>{if(heard.length===2) ac.abort();return true;},
  });
  assert.deepEqual(incoming,[[],['梵高先过桥。']]);
  assert.deepEqual(heard,['先过桥。','那我在桥头等你。']);
  const data=dialogueBody(pair[0],'和达利聊散步',[],'duo');
  assert.equal(data.mode,'duo');
});
