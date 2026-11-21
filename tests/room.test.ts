import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artists} from '../src/lib/artists.ts';
import {responderFor,roomReply} from '../src/lib/room.ts';
const guests=artists.slice(0,4);
test('anyone can speak at the table without first selecting an artist',()=>{
  assert.equal(responderFor('今天好累',guests,null,null)?.id,'georgia');
  assert.equal(responderFor('日落真美',guests,null,null)?.id,'monet');
  assert.equal(responderFor('看看莫奈的睡莲',guests,null,null)?.id,'monet');
  assert.equal(responderFor('Water Lilies',guests,null,null)?.id,'monet');
  assert.equal(responderFor('喜欢蓝色',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('聊聊星月夜',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('The Starry Night',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('我昨天做了一个梦',guests,null,null)?.id,'dali');
});
test('calling a name overrides topic and a selected seat',()=>{
  assert.equal(responderFor('梵高，你怎么看日落',guests,'monet','dali')?.id,'vincent');
  assert.equal(responderFor('欧姬芙，你会做梦吗',guests,null,null)?.id,'georgia');
});
test('a chosen guest stays in the conversation and an unnamed follow-up has context',()=>{
  assert.equal(responderFor('颜色呢',guests,'monet',null)?.id,'monet');
  assert.equal(responderFor('后来呢',guests,null,'dali')?.id,'dali');
});
test('removed seats cannot receive a response, including a custom-only table',()=>{
  const a={...artists[4],id:'custom-paper',name:'纸灯'};
  assert.equal(responderFor('日落', [a], 'monet','dali')?.id,a.id);
  assert.equal(responderFor('你好',[],null,null),undefined);
});
test('a boundary is not replaced with an enthusiastic topical reply',()=>{
  assert.equal(roomReply(guests[0],'不要聊日落'),null);
  assert.equal(roomReply(guests[2],'我不想说这个梦'),null);
  assert.ok(roomReply(guests[0],'日落')?.includes('明天'));
});
test('named paintings route to their present owner before broad color themes',()=>{
  for(const title of ['记忆的永恒','永恒的记忆','THE   PERSISTENCE OF MEMORY']){
    assert.equal(responderFor(title,guests,null,'monet')?.id,'dali',title);
  }
  for(const title of ['蓝与绿的音乐','蓝色与绿色的音乐','Blue and Green Music']){
    assert.equal(responderFor(title,guests,null,'vincent')?.id,'georgia',title);
  }
  assert.equal(responderFor('星月夜和蓝与绿的音乐',guests,null,null)?.id,'georgia');
});
test('direct address and selected seat still override a painting owner',()=>{
  assert.equal(responderFor('莫奈，你怎么看记忆的永恒',guests,'georgia',null)?.id,'monet');
  assert.equal(responderFor('蓝与绿的音乐',guests,'dali',null)?.id,'dali');
  assert.equal(responderFor('欧姬芙，你怎么看星月夜',guests,'monet',null)?.id,'georgia');
});
test('declining the image still routes the textual discussion to its artist',()=>{
  assert.equal(responderFor('先别展示图片，只聊记忆的永恒，一句话。',guests,null,'georgia')?.id,'dali');
  assert.equal(responderFor('不用展示蓝色与绿色的音乐，只聊聊它。',guests,null,'dali')?.id,'georgia');
  assert.equal(responderFor('先别展示图片，只聊记忆的永恒。',guests,'monet','georgia')?.id,'monet');
});
test('an absent painting owner is never inserted into the table',()=>{
  const custom={...artists[4],id:'custom-paper',name:'纸灯',fullName:'纸灯',english:'Paper Lantern'};
  const onlyMonet=[guests[0]];
  assert.equal(responderFor('记忆的永恒',onlyMonet,'dali','dali')?.id,'monet');
  assert.equal(responderFor('蓝与绿的音乐',[custom],null,'georgia')?.id,custom.id);
  assert.equal(roomReply(custom,'蓝与绿的音乐'),null);
  assert.equal(responderFor('蓝与绿的音乐',[],null,null),undefined);
});
test('new artwork replies keep their own voice and leave ordinary topics unchanged',()=>{
  assert.match(roomReply(guests[2],'聊聊记忆的永恒')??'',/软下来的钟/);
  assert.match(roomReply(guests[3],'Blue and Green Music')??'',/蓝和绿相接的边缘/);
  assert.equal(roomReply(guests[3],'记忆的永恒'),null);
  assert.equal(roomReply(guests[2],'不要聊记忆的永恒'),null);
  assert.equal(responderFor('喜欢蓝色',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('这个时钟真奇怪',guests,null,null)?.id,'dali');
  assert.doesNotMatch(roomReply(guests[2],'这个时钟真奇怪')??'',/软下来的钟/);
});

test('ordinary meal choices answer the question instead of returning a generic permission to chat',()=>{
  const lines=guests.map(a=>roomReply(a,'你想吃什么？'));
  assert.ok(lines.every(Boolean));assert.equal(new Set(lines).size,guests.length);
  for(const line of lines)assert.doesNotMatch(line!,/光影|配色|笔触|日常的小事也可以聊|谢谢/);
  assert.match(roomReply(guests[0],'我觉得面有点咸')??'',/咸/);
  assert.match(roomReply(guests[0],'今天不想出门，只想聊电影')??'',/哪一部/);
  assert.notEqual(roomReply(guests[0],'你好像听错了'),guests[0].greeting);
});

test('a custom identity keeps a neutral local fallback rather than inheriting a built-in daily taste',()=>{
  const custom={...guests[0],id:'custom-monet',name:'莫奈'};
  assert.match(roomReply(custom,'你想吃什么？')??'',/没想好/);
  assert.doesNotMatch(roomReply(custom,'你想吃什么？')??'',/热汤|面包/);
});

test('an addressee is not replaced by another artist merely mentioned in the question',()=>{
  assert.equal(responderFor('达利，你怎么看梵高的画？',guests,'monet','vincent')?.id,'dali');
  assert.equal(responderFor('你见过梵高吗？',guests,'dali','monet')?.id,'dali');
  assert.equal(responderFor('你见过梵高吗？',guests,null,'dali')?.id,'dali');
  assert.equal(responderFor('梵高的画你怎么看？',guests,'dali','monet')?.id,'dali');
  assert.equal(responderFor('我想问问达利，你怎么看梵高的画？',guests,'monet','vincent')?.id,'dali');
  assert.equal(responderFor('Salvador Dalí, 你怎么看梵高的画？',guests,'monet','vincent')?.id,'dali');
  assert.equal(responderFor('电影里他说“莫奈，你怎么看”，你会怎么接？',guests,'dali','vincent')?.id,'dali');
  const custom={...artists[4],id:'custom-symbol',name:'A+B',fullName:'A+B',english:'A+B'};
  assert.equal(responderFor('A+B，你怎么看莫奈的画？',[...guests,custom],'dali',null)?.id,custom.id);
});

test('ordinary follow-ups keep the speaker while fresh topics and named artworks retain routing',()=>{
  for(const input of ['今天吃什么？','今天觉得累吗？','我喜欢蓝色','我昨天做了一个梦'])assert.equal(responderFor(input,guests,null,'monet')?.id,'monet',input);
  assert.equal(responderFor('今天吃什么？',guests,null,null)?.id,'georgia');
  assert.equal(responderFor('我喜欢蓝色',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('今天聊星月夜',guests,null,'monet')?.id,'vincent');
  assert.equal(responderFor('今天聊星月夜',guests,'dali','monet')?.id,'dali');
  assert.equal(responderFor('莫奈，今天聊星月夜',guests,'dali','vincent')?.id,'monet');
});
