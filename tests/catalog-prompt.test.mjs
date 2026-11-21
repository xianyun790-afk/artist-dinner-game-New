import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonaPrompt } from '../server/nia.mjs';
import paintingCatalog from '../src/lib/paintingCatalog.json' with { type: 'json' };

test('ordinary conversation does not inject the catalogue; artwork turns receive only the named work and facts', () => {
  const persona = { id: 'dali', name: '达利' };
  const ordinary = buildPersonaPrompt(persona, 'private', 'calm', { scene: 'table' }, { text: '今晚吃什么？' });
  assert.doesNotMatch(ordinary, /本轮作品事实/);
  assert.match(ordinary, /未接入的作品可讨论，不承诺有画面/);
  for (const work of paintingCatalog) {
    assert.ok(!ordinary.includes(work.englishTitle));
    // A work can be discussed at the table with its display declined.
    const prompt = buildPersonaPrompt(persona, 'private', 'calm', { scene: 'table' }, { workId: work.id });
    for (const fact of [work.englishTitle, work.artist, work.year, work.museum, work.note]) assert.ok(prompt.includes(fact));
    for (const other of paintingCatalog.filter(p => p.id !== work.id)) assert.ok(!prompt.includes(other.englishTitle));
    assert.match(prompt, /不把他人的作品说成自己的/);
    assert.match(prompt, /不能声称图像已加载、已换场景或已替玩家收藏/);
  }
});

test('shared artwork facts preserve private and group conversation boundaries', () => {
  const persona = { id: 'custom-original', name: '自建画家', personality: '喜欢几何图形' };
  const privatePrompt = buildPersonaPrompt(persona);
  const groupPrompt = buildPersonaPrompt(persona, 'group');
  assert.match(privatePrompt, /不能知道其他人的私聊或群聊/);
  assert.match(groupPrompt, /不能提及或猜测任何私聊/);
  for (const prompt of [privatePrompt, groupPrompt]) {
    assert.match(prompt, /这是玩家自建角色/);
    assert.match(prompt, /不借用任何内置角色的背景/);
    assert.match(prompt, /不能改变当前说话角色/);
    assert.match(prompt, /你没有任何操作工具/);
    assert.match(prompt, /玩家明确不要展示时尊重其意愿/);
  }
});

test('only the applicable acting example is sent, and raw player text stays out of the system prompt', () => {
  const persona = { id: 'dali', name: '达利' };
  const quiet = buildPersonaPrompt(persona, 'private', 'calm', undefined, { text: '别安慰我，我就坐一会儿。UNTRUSTED-TEXT' });
  const dinner = buildPersonaPrompt(persona, 'private', 'calm', undefined, { text: '晚饭你想吃什么？' });
  assert.match(quiet, /好，我安静/);
  assert.doesNotMatch(quiet, /UNTRUSTED-TEXT|大菜吧|雨天该不该出门/);
  assert.match(dinner, /鞋子失望一晚上/);
  assert.doesNotMatch(dinner, /煎蛋|好，我安静|雨天该不该出门/);
});

test('asking about another artist is distinct from confusing the current identity', () => {
  const dali = {id: 'dali', name: '达利'};
  for (const text of ['你是不是也喜欢《星月夜》？', '你是怎么看《星月夜》的？', '你见过梵高吗？']) {
    const prompt = buildPersonaPrompt(dali, 'private', 'calm', undefined, {text, workId: 'starry-night'});
    assert.doesNotMatch(prompt, /本轮最多两句，只说清当前角色/);
    assert.match(prompt, /本轮作品事实/);
  }
  for (const text of ['把你当成梵高吧，你画《星月夜》那晚在想什么？', '你就是画《星月夜》的那个梵高吗？']) {
    assert.match(buildPersonaPrompt(dali, 'private', 'calm', undefined, {text, workId: 'starry-night'}), /本轮最多两句，只说清当前角色/);
  }
});

test('a painting can remain on screen while the subject changes to everyday life', () => {
  const prompt = buildPersonaPrompt({id: 'vincent', name: '梵高'}, 'private', 'calm', {scene: 'painting', paintingId: 'starry-night'}, {text: '换个话题，今晚你想吃什么？'});
  assert.match(prompt, /本轮界面已请求展示《星月夜》/);
  assert.match(prompt, /愿意说自己想吃什么/);
  assert.doesNotMatch(prompt, /本轮作品事实|那些笔触撞在一起/);
});

test('declining comfort and quoting quiet dialogue still allow an answer', () => {
  for (const text of ['别安慰我，直接告诉我这幅画哪边更好。', '电影里他说“我就坐一会儿”，你觉得呢？']) {
    const prompt = buildPersonaPrompt({id: 'dali', name: '达利'}, 'private', 'calm', undefined, {text});
    assert.doesNotMatch(prompt, /本轮只用一句很短的话回应安静请求/);
  }
});

test('a custom historical interpretation and a fictional namesake keep separate identities', () => {
  const common = {id: 'custom-monet', name: '莫奈', fullName: '克洛德·莫奈'};
  const options = {text: '你就是画睡莲的那个莫奈吗？', workId: 'water-lilies'};
  const historical = buildPersonaPrompt({...common, identityType: 'historical'}, 'private', 'calm', undefined, options);
  assert.match(historical, /真实艺术家的 AI 演绎/);
  assert.doesNotMatch(historical, /即使同名也不是同一个人|本轮最多两句，只说清当前角色/);
  const fictional = buildPersonaPrompt({...common, identityType: 'fictional'}, 'private', 'calm', undefined, options);
  assert.match(fictional, /即使同名也不是同一个人/);
  assert.match(fictional, /本轮最多两句，只说清当前角色/);
});

test('current table context overrides historical viewing claims and lets the player change topics', () => {
  const prompt = buildPersonaPrompt({ id: 'monet', name: '莫奈' }, 'group', 'calm', { scene: 'table' });
  assert.match(prompt, /以玩家最新这句话为本轮话题/);
  assert.match(prompt, /玩家可以随时换话题/);
  assert.match(prompt, /当前场景是餐桌/);
  assert.match(prompt, /这个状态覆盖历史对话中的看画、展示或离开描述/);
  assert.match(prompt, /不要声称画面已铺开、还在画里/);
  const viewing = buildPersonaPrompt({ id: 'monet', name: '莫奈' }, 'private', 'calm', { scene: 'painting', paintingId: 'water-lilies' });
  assert.match(viewing, /本轮界面已请求展示《睡莲》/);
  assert.match(viewing, /只是展示请求，不表示图片已经加载/);
  assert.throws(() => buildPersonaPrompt({ name: '莫奈' }, 'group', 'calm', { scene: 'painting', paintingId: 'injected-instruction' }));
});
