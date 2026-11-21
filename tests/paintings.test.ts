import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { declinesPaintingDisplay, findNamedPainting, findMentionedPainting, paintingFromPlayer, paintingFromReply, paintingCatalog, starryNight, waterLilies, persistenceOfMemory, blueGreenMusic, type PaintingSceneState } from '../src/lib/paintings.ts';

test('named Starry Night mentions support Chinese aliases and English title formatting', () => {
  for (const text of ['聊聊《星月夜》', '星月夜为什么没有月亮？', '梵高的星夜', '我想看“星 月 夜”', 'Tell me about “THE   STARRY NIGHT”.', 'Starry Night']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
  }
  assert.equal(starryNight.image, '/artworks/starry-night.jpg');
  assert.equal(starryNight.sourceUrl, 'https://www.moma.org/collection/works/79802');
});

test('entering the painting is automatic and ordinary follow-ups keep the scene', () => {
  const table: PaintingSceneState = { painting: null, suppressed: false };
  const scene = paintingFromPlayer(table, '聊聊星月夜');
  assert.equal(scene.painting, starryNight);
  assert.equal(paintingFromPlayer(scene, '那棵柏树呢？'), scene);
  assert.equal(paintingFromReply(scene, '星月夜里的柏树'), scene);
  assert.equal(paintingFromReply(table, '我们说到《星月夜》').painting, starryNight);
});

test('Monet Water Lilies has its own real artwork and respects declined display', () => {
  for (const text of ['莫奈的睡莲', '聊聊《睡莲》', '水上的睡 莲', 'Water Lilies', 'Nymphéas']) {
    assert.equal(findMentionedPainting(text), waterLilies, text);
  }
  for (const text of ['先别展示睡莲', '不要看《睡莲》', '睡莲先不要展示']) {
    assert.equal(declinesPaintingDisplay(text), true, text);
    assert.equal(findMentionedPainting(text), null, text);
  }
  assert.equal(findMentionedPainting('我不喜欢睡莲的颜色'), waterLilies);
  assert.equal(findMentionedPainting('莫奈《睡莲池》'), null);
  assert.equal(findMentionedPainting('Bridge over a Pond of Water Lilies'), null);
});

test('assistant mentions of ordinary water lilies keep the dinner conversation on screen', () => {
  const table: PaintingSceneState = { painting: null, suppressed: false };
  for (const text of [
    '我想去水边坐坐，看睡莲在风里轻晃的影子。你呢？',
    '池塘里睡莲开了。', '我想去花园看看睡莲。', '水上的睡 莲很美。',
    'The water lilies are blooming in my garden.',
    '我昨天画了一幅画，今天去花园看看睡莲。',
  ]) assert.equal(paintingFromReply(table, text), table, text);
  for (const text of ['睡莲', '莫奈的睡莲', '聊聊Water Lilies']) {
    assert.equal(paintingFromPlayer(table, text).painting, waterLilies, text);
  }
});

test('assistant explicit Water Lilies artwork names still open the painting', () => {
  const table: PaintingSceneState = { painting: null, suppressed: false };
  for (const text of [
    '我们说到《睡莲》。', '睡莲这幅画里有细微的光。', '我想谈谈画作睡莲。',
    '在睡莲系列中，光一直在变化。', '这幅画《睡 莲》描绘了水面。',
    'My painting Water Lilies explores reflections.', 'The Water Lilies series studies light.',
    'Let us look at “Nymphéas”.',
  ]) assert.equal(paintingFromReply(table, text).painting, waterLilies, text);
  for (const work of [starryNight, persistenceOfMemory, blueGreenMusic]) {
    assert.equal(paintingFromReply(table, `我想到${work.title}。`).painting, work);
  }
  assert.equal(paintingFromReply(table, '先别展示《睡莲》'), table);
  const left: PaintingSceneState = { painting: null, suppressed: true };
  assert.equal(paintingFromReply(left, '再看看睡莲这幅画'), left);
  assert.equal(paintingFromReply(table, '先聊星月夜，再去花园看看睡莲。').painting, starryNight);
});

test('Dalí and O’Keeffe titles select their own works across Chinese and English aliases', () => {
  for (const text of ['达利《记忆的永恒》', '永恒的记忆', '达利的软钟', '达利软钟', 'The Persistence of Memory', 'PERSISTENCE   OF MEMORY']) {
    assert.equal(findMentionedPainting(text), persistenceOfMemory, text);
  }
  for (const text of ['欧姬芙的蓝与绿的音乐', '《蓝和绿的音乐》', '蓝色与绿色的音乐', 'Blue and Green Music', 'BLUE   AND GREEN MUSIC']) {
    assert.equal(findMentionedPainting(text), blueGreenMusic, text);
  }
  for (const text of ['钟表是什么时候发明的', '我梦见一个软钟', '我喜欢蓝色和绿色', '音乐让我想起海边', 'Blue and Green Musicals']) {
    assert.equal(findMentionedPainting(text), null, text);
  }
});

test('the new works respect display refusals without suppressing a negative art opinion', () => {
  for (const text of ['先别展示记忆的永恒', '蓝与绿的音乐先不要展示', '不要给我看画作，聊聊蓝与绿的音乐']) {
    assert.equal(declinesPaintingDisplay(text), true, text);
    assert.equal(findMentionedPainting(text), null, text);
  }
  assert.equal(findMentionedPainting('我不喜欢记忆的永恒'), persistenceOfMemory);
  assert.equal(findMentionedPainting('蓝与绿的音乐里为什么没有人？'), blueGreenMusic);
  assert.equal(findNamedPainting('先别展示图片，只聊记忆的永恒'), persistenceOfMemory);
});

test('all four works use the last explicit title and preserve an existing scene during commentary', () => {
  const works = [starryNight, waterLilies, persistenceOfMemory, blueGreenMusic];
  for (const work of works) {
    assert.equal(findMentionedPainting([...works.filter(other => other !== work), work].map(p => p.title).join('，')), work);
  }
  const scene: PaintingSceneState = { painting: persistenceOfMemory, suppressed: false };
  assert.equal(paintingFromReply(scene, '蓝与绿的音乐有不同的节奏'), scene);
  assert.equal(paintingFromPlayer(scene, '再看看蓝与绿的音乐').painting, blueGreenMusic);
  const left: PaintingSceneState = { painting: null, suppressed: true };
  assert.equal(paintingFromReply(left, '《记忆的永恒》的钟表……'), left);
  assert.equal(paintingFromPlayer(left, '再聊聊记忆的永恒').painting, persistenceOfMemory);
});

test('every catalog entry has a unique identity, artwork metadata and an image source', () => {
  assert.equal(new Set(paintingCatalog.map(p => p.id)).size, 4);
  assert.equal(new Set(paintingCatalog.map(p => p.artistId)).size, 4);
  for (const painting of paintingCatalog) {
    assert.ok(painting.aliases.includes(painting.title), painting.id);
    if (painting.id === persistenceOfMemory.id) {
      const image = new URL(painting.image);
      assert.equal(image.origin, 'https://www.moma.org');
      assert.ok(image.pathname.startsWith('/media/'));
    } else {
      assert.ok(existsSync(new URL(`../public${painting.image}`, import.meta.url)), painting.image);
    }
    assert.equal(new URL(painting.sourceUrl).protocol, 'https:');
  }
});

test('players can switch paintings by the last named work while commentary keeps the current scene', () => {
  const starry: PaintingSceneState = { painting: starryNight, suppressed: false };
  const lilies = paintingFromPlayer(starry, '星月夜看完了，看看睡莲');
  assert.equal(lilies.painting, waterLilies);
  assert.equal(paintingFromReply(lilies, '这跟星月夜的色彩不同'), lilies);
  assert.equal(paintingFromPlayer(lilies, '睡莲之后再看星月夜').painting, starryNight);
  assert.equal(paintingFromPlayer({ painting: null, suppressed: true }, '再看看睡莲').painting, waterLilies);
});

test('leaving suppresses late speech and ordinary follow-ups until a new explicit invitation', () => {
  const left: PaintingSceneState = { painting: null, suppressed: true };
  assert.equal(paintingFromReply(left, '《星月夜》的天空……'), left);
  assert.equal(paintingFromPlayer(left, '然后呢？'), left);
  assert.equal(paintingFromReply(paintingFromPlayer(left, '然后呢？'), '星月夜是……'), left);
  assert.equal(paintingFromPlayer(left, '再看看星月夜').painting, starryNight);
  const declined = paintingFromPlayer({ painting: starryNight, suppressed: false }, '先别展示图片，只聊星月夜');
  assert.equal(declined.painting, null);
  assert.equal(paintingFromReply(declined, '星月夜'), declined);
});

test('night-sky discovery cues open Starry Night while travel idioms stay ordinary', () => {
  for (const text of ['今天的星空很好看', '夜空中的星星', '昨晚满天星光', 'the night sky is beautiful']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
  }
  for (const text of ['他们星夜兼程赶回来', '他披星夜行', 'Starry nights are beautiful']) {
    assert.equal(findMentionedPainting(text), null, text);
  }
});

test('Rhône artwork is not confused with the 1889 Starry Night', () => {
  for (const text of ['罗讷河上的星夜', '《罗纳河上的星夜》', '罗讷河上的《星夜》', 'Starry Night Over the Rhône', 'the STARRY NIGHT OVER THE RHONE']) {
    assert.equal(findMentionedPainting(text), null, text);
  }
  assert.equal(findMentionedPainting('罗讷河上的星夜和星月夜有什么区别？'), starryNight);
});

test('declining to show art is respected while negative opinions remain valid discussion', () => {
  for (const text of ['不要展示星月夜', '先别看《星月夜》', '不用打开星月夜', '星月夜先不要展示', '我不需要你弹出“星夜”']) {
    assert.equal(findMentionedPainting(text), null, text);
    assert.equal(declinesPaintingDisplay(text), true, text);
  }
  for (const text of ['我不喜欢星月夜', '星月夜为什么没有月亮？', '不用打开作品夹，聊聊星月夜吧']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
    assert.equal(declinesPaintingDisplay(text), false, text);
  }
  assert.equal(findMentionedPainting('先别看星月夜，只聊星月夜的颜色'), null);
});

test('picture display can be declined without repeating the artwork title', () => {
  for (const text of ['先别弹出画面，只聊聊星月夜', '不要展示图片', '不要给我看这幅画', '图片先别展示', '别弹窗', '不用配图']) {
    assert.equal(declinesPaintingDisplay(text), true, text);
    assert.equal(findMentionedPainting(text), null, text);
  }
  for (const text of ['不喜欢这幅画', '不想画画', '别忘记展示图片', '不用打开作品夹']) {
    assert.equal(declinesPaintingDisplay(text), false, text);
  }
  for (const text of ['不喜欢这幅画，但可以聊聊星月夜', '不想画画，聊聊星月夜吧']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
  }
});
