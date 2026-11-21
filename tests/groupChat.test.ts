import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists } from '../src/lib/artists.ts';
import { freshSave, enterConversation, freeTalk } from '../src/lib/engine.ts';
import { appendGroupMessage, createGroup, groupReplies, playGroupRound } from '../src/lib/groupChat.ts';
import { loadSave } from '../src/lib/storage.ts';

const members = artists.slice(0, 4);
test('groups require two known distinct artists and accept a custom artist independently of its template', () => {
  assert.equal(createGroup('g', '', ['monet', 'monet', 'unknown'], artists), null);
  const custom = { ...artists[4], id: 'custom-paper', name: '纸灯' };
  const group = createGroup('g', '', ['monet', custom.id], [...artists, custom])!;
  assert.deepEqual(group.memberIds, ['monet', custom.id]);
  assert.equal(group.name, '莫奈、纸灯');
});
test('normal rounds are bounded, direct addresses constrain replies, and everyone means all group members', () => {
  assert.equal(groupReplies('聊聊日落', members, [], null).length, 2);
  assert.deepEqual(groupReplies('达利，你怎么看颜色', members, [], 'monet').map(r => r.artist.id), ['dali']);
  assert.deepEqual(groupReplies('梵高和莫奈聊聊颜色', members, [], null).map(r => r.artist.id), ['monet', 'vincent']);
  assert.equal(groupReplies('大家怎么看星空', members, [], null).length, 4);
  assert.deepEqual(groupReplies('梵高怎么看', [members[0], members[2]], [], null).map(r => r.artist.id).sort(), ['dali', 'monet']);
  assert.equal(groupReplies('大家先安静一会儿', members, [], null).length, 0);
  assert.ok(groupReplies('不要聊颜色', members, [], null).every(r => r.text.includes('话题先放下')));
});
test('group storage does not change private histories or leak another group into this one', () => {
  const original = freeTalk(enterConversation(freshSave(), members[0]), members[0], '这是我的私人便签');
  original.groupChats = [createGroup('a', '颜色', ['monet', 'vincent'], artists)!, createGroup('b', '梦境', ['dali', 'georgia'], artists)!];
  const next = appendGroupMessage(original, 'a', { id: 'm', who: 'player', text: '今天想聊星空' });
  assert.deepEqual(next.people, original.people);
  assert.deepEqual(original.groupChats[0].messages, []);
  assert.deepEqual(next.groupChats![1].messages, []);
  assert.equal(next.groupChats![0].messages[0].text, '今天想聊星空');
  assert.ok(!JSON.stringify(next.groupChats).includes('私人便签'));
});
test('round waits for previous playback to finish before preparing the next artist', async () => {
  const replies = groupReplies('大家聊聊星空', members.slice(0, 2), [], null), events: string[] = [];
  let firstDone!: () => void;
  const playing = new Promise<void>(resolve => { firstDone = resolve; });
  const round = playGroupRound(replies, new AbortController().signal, {
    thinking: r => { events.push(`think:${r.artist.id}`); }, pause: async () => {},
    present: r => { events.push(`present:${r.artist.id}`); },
    speak: async r => { events.push(`speak:${r.artist.id}`); if (r.artist.id === 'monet') await playing; },
  });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ['think:monet', 'present:monet', 'speak:monet']);
  firstDone(); await round;
  assert.deepEqual(events.slice(3), ['think:vincent', 'present:vincent', 'speak:vincent']);
});
test('interrupting preparation or playback cancels the rest of the round', async () => {
  const replies = groupReplies('大家聊聊星空', members, [], null);
  for (const interruptAt of ['pause', 'speak']) {
    const controller = new AbortController(), shown: string[] = [], spoken: string[] = [];
    await playGroupRound(replies, controller.signal, {
      thinking: () => {}, pause: async () => { if (interruptAt === 'pause') controller.abort(); },
      present: r => { shown.push(r.artist.id); },
      speak: async r => { spoken.push(r.artist.id); controller.abort(); },
    });
    assert.equal(shown.length, interruptAt === 'pause' ? 0 : 1);
    assert.equal(spoken.length, interruptAt === 'pause' ? 0 : 1);
  }
});
test('old saves migrate without groups; invalid group data is dropped without losing private progress', () => {
  let raw = JSON.stringify(freshSave());
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw, setItem: () => {} } });
  assert.deepEqual(loadSave().save.groupChats, []);
  const save = freeTalk(enterConversation(freshSave(), members[0]), members[0], '你好');
  save.groupChats = [createGroup('valid', '', ['monet', 'vincent'], artists)!, { id: 'bad', name: '失效的群', memberIds: ['unknown'], messages: [] }];
  raw = JSON.stringify(save);
  const loaded = loadSave();
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.save.groupChats!.length, 1);
  assert.deepEqual(loaded.save.people, JSON.parse(JSON.stringify(save.people)));
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('interrupting model generation prevents presenting and voicing its late result', async () => {
  const replies = groupReplies('大家聊聊星空', members, [], null), controller = new AbortController();
  let finish!: () => void, presented = 0, spoken = 0;
  const generating = new Promise<void>(resolve => { finish = resolve; });
  const round = playGroupRound(replies, controller.signal, {
    thinking: () => {}, pause: async () => {}, generate: async reply => { await generating; return reply; },
    present: () => { presented++; }, speak: async () => { spoken++; },
  });
  await Promise.resolve(); controller.abort(); finish(); await round;
  assert.equal(presented, 0); assert.equal(spoken, 0);
});

test('everyday group choices do not become silence, art scripts or a repeated handoff template',()=>{
  const replies=groupReplies('大家今天不想出门，只想聊电影。',members,[],null);
  assert.equal(replies.length,members.length);
  for(const reply of replies){assert.match(reply.text,/哪一部|哪部电影/);assert.doesNotMatch(reply.text,/话题先放下|我也想到一点|画纸|配色/);}
  const food=groupReplies('大家想吃什么？',members,[],null);
  assert.equal(new Set(food.map(r=>r.text)).size,members.length);
  for(const reply of food)assert.doesNotMatch(reply.text,/谢谢|我也想到一点|光影|笔触/);
  assert.equal(groupReplies('大家安静，给我看看星月夜',members,[],null).length,0);
  assert.equal(groupReplies('大家觉得安静的地方适合看电影吗？',members,[],null).length,members.length);
});

test('quoted or reported movie dialogue does not silence the table',()=>{
  for(const input of ['大家怎么看电影里那句“别说了”？','大家，电影里有人说别说了，你们怎么理解？','大家，电影里有人说，别说了，你们怎么理解？','大家，台词是“安静”，你们怎么理解？','大家，电影里有人喊：「大家安静！」'])assert.equal(groupReplies(input,members,[],null).length,members.length,input);
  for(const input of ['大家别说了','大家安静','电影先放一放。大家安静一会儿。'])assert.equal(groupReplies(input,members,[],null).length,0,input);
});

test('group addressees exclude an artist mentioned as the subject of a question',()=>{
  assert.deepEqual(groupReplies('达利，你怎么看梵高的画？',members,[],'monet').map(r=>r.artist.id),['dali']);
  assert.deepEqual(groupReplies('达利和莫奈，聊聊梵高的画？',members,[],'vincent').map(r=>r.artist.id),['monet','dali']);
  const history=[{id:'previous',who:'artist' as const,artistId:'dali',text:'刚才说到哪儿了？'}];
  assert.equal(groupReplies('今天吃什么？',members,history,null)[0]?.artist.id,'dali');
  assert.equal(groupReplies('你见过梵高吗？',members,history,'dali')[0]?.artist.id,'dali');
});
