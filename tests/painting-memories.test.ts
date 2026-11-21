import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists } from '../src/lib/artists.ts';
import { freshSave, enterConversation, freeTalk } from '../src/lib/engine.ts';
import { PAINTING_MEMORY_LIMIT, recordPaintingMemory, sanitizePaintingMemories } from '../src/lib/paintingMemories.ts';
import { exportSave, loadSave, writeSave } from '../src/lib/storage.ts';
import type { PaintingMemory } from '../src/lib/types.ts';

const speakers = new Set(artists.map(a => a.id));
const memory = (id = 'encounter-1'): PaintingMemory => ({
  id, paintingId: 'starry-night', speakerId: 'vincent', question: '这棵柏树为什么这么高？',
  explanation: '柏树把前景和天空连在一起，深色也让星光更明亮。',
  createdAt: '2026-11-09T12:00:00.000Z', night: 1,
});

test('completed encounters are idempotent by ID while distinct visits remain separate', () => {
  const original = freeTalk(enterConversation(freshSave(), artists[1]), artists[1], '你好');
  const first = recordPaintingMemory(original, memory());
  assert.equal(first.paintingMemories?.length, 1);
  assert.equal(recordPaintingMemory(first, { ...memory(), explanation: '迟来的重复回调' }), first);
  const second = recordPaintingMemory(first, memory('encounter-2'));
  assert.deepEqual(second.paintingMemories?.map(m => m.id), ['encounter-1', 'encounter-2']);
  assert.equal(original.paintingMemories, undefined);
  assert.equal(second.people, original.people);
  assert.equal(second.works, original.works);
  assert.equal(second.voiceSettings, original.voiceSettings);
});

test('records derive artwork from the local catalog and distinguish the speaker from its author', () => {
  const custom = { ...artists[4], id: 'custom-paper', name: '纸灯' };
  const save = { ...freshSave(), customArtists: [custom] };
  const untrusted = { ...memory(), speakerId: custom.id, image: 'https://attacker.invalid/image.jpg', sourceUrl: 'javascript:alert(1)', artist: '纸灯本人创作' };
  const recorded = recordPaintingMemory(save, untrusted);
  assert.deepEqual(recorded.paintingMemories, [{ ...memory(), speakerId: custom.id }]);
  assert.deepEqual(Object.keys(recorded.paintingMemories![0]).sort(), ['createdAt', 'explanation', 'id', 'night', 'paintingId', 'question', 'speakerId']);
  assert.equal(recordPaintingMemory(save, { ...memory(), paintingId: 'invented-custom-masterpiece' }), save);
  assert.equal(recordPaintingMemory(save, { ...memory(), speakerId: 'unknown' }), save);
  assert.equal(recordPaintingMemory(save, { ...memory(), speakerId: 'lin' }).paintingMemories?.[0].paintingId, 'starry-night');
});

test('a view-only memory keeps an empty explanation without inventing dialogue', () => {
  const viewOnly = { ...memory(), explanation: '' };
  const recorded = recordPaintingMemory(freshSave(), viewOnly);
  assert.deepEqual(recorded.paintingMemories, [viewOnly]);
  assert.deepEqual(sanitizePaintingMemories([{ ...viewOnly, explanation: '  \n  ' }], speakers), [viewOnly]);
  assert.equal(recordPaintingMemory(recorded, { ...memory(), explanation: '尚未播放的台词' }), recorded);
  const { explanation: _explanation, ...missingExplanation } = memory();
  for (const invalid of [missingExplanation, { ...memory(), explanation: undefined }, { ...memory(), explanation: null }]) {
    assert.deepEqual(sanitizePaintingMemories([invalid], speakers), []);
  }
});

test('malformed entries are discarded and valid entries keep only bounded canonical fields', () => {
  const valid = { ...memory(), question: '  看看星月夜  ', explanation: '  颜色挨在一起很有力。  ', injected: true };
  const invalid = [null, [], 'not a record', {},
    { ...memory(), id: '' }, { ...memory(), id: 'x'.repeat(101) },
    { ...memory(), paintingId: 'https://attacker.invalid/image.jpg' },
    { ...memory(), speakerId: 'unknown' }, { ...memory(), question: 'x'.repeat(401) },
    { ...memory(), explanation: 'x'.repeat(4001) }, { ...memory(), explanation: null },
    { ...memory(), createdAt: 'yesterday' }, { ...memory(), createdAt: '2026-02-30T12:00:00.000Z' },
    { ...memory(), createdAt: '2026-11-09' }, { ...memory(), night: 0 },
    { ...memory(), night: 1.5 }, { ...memory(), night: 1_000_001 },
  ];
  const result = sanitizePaintingMemories([...invalid, valid, { ...memory(), explanation: '重复ID不覆盖首次记录' }], speakers);
  assert.deepEqual(result, [{ ...memory(), question: '看看星月夜', explanation: '颜色挨在一起很有力。' }]);
  for (const raw of [undefined, null, {}, 'broken']) assert.deepEqual(sanitizePaintingMemories(raw, speakers), []);
});

test('the latest 200 valid encounters are retained without expanding other progress', () => {
  const raw = Array.from({ length: PAINTING_MEMORY_LIMIT + 1 }, (_, i) => memory(`encounter-${i}`));
  const result = sanitizePaintingMemories(raw, speakers);
  assert.equal(result.length, 200);
  assert.equal(result[0].id, 'encounter-1');
  assert.equal(result.at(-1)?.id, 'encounter-200');
  const save = { ...freshSave(), paintingMemories: result };
  const appended = recordPaintingMemory(save, memory('encounter-201'));
  assert.equal(appended.paintingMemories?.length, 200);
  assert.equal(appended.paintingMemories?.[0].id, 'encounter-2');
});

test('old or damaged optional painting memories do not lose conversations, works or group progress', t => {
  let raw = '';
  t.mock.method(globalThis, 'setTimeout', () => 0 as unknown as ReturnType<typeof setTimeout>);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw, setItem: () => {} } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const save = freeTalk(enterConversation(freshSave(), artists[0]), artists[0], '这是给莫奈的私聊');
  save.groupChats = [{ id: 'g', name: '一起聊', memberIds: ['monet', 'vincent'], messages: [{ id: 'gm', who: 'player', text: '今晚的光' }] }];
  save.works = [{ id: 'work', artistId: 'monet', title: '我们的试稿', mark: 'light', paths: [], createdAt: memory().createdAt, night: 1, shared: false, disagreement: false }];
  for (const optional of [undefined, 'broken', [memory(), { ...memory('invalid'), speakerId: 'missing' }]]) {
    raw = JSON.stringify({ ...save, paintingMemories: optional });
    const loaded = loadSave();
    assert.equal(loaded.error, undefined);
    assert.deepEqual(loaded.save.paintingMemories, Array.isArray(optional) ? [memory()] : []);
    assert.deepEqual(loaded.save.people, JSON.parse(JSON.stringify(save.people)));
    assert.deepEqual(loaded.save.works, save.works);
    assert.deepEqual(loaded.save.groupChats, save.groupChats);
    assert.equal(loaded.save.night, save.night);
  }
});

test('painting memories persist through local storage and the complete JSON export', async t => {
  let raw: string | null = null, exported: Blob | undefined;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } } });
  const link = { href: '', download: '', click: () => {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => link } });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  });
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => { exported = blob; return 'blob:local-test'; });
  t.mock.method(globalThis, 'setTimeout', () => 0 as unknown as ReturnType<typeof setTimeout>);
  const save = recordPaintingMemory(freshSave(), memory());
  assert.equal(writeSave(save), true);
  assert.deepEqual(loadSave().save.paintingMemories, [memory()]);
  exportSave(save);
  assert.equal(link.download, '余光-第1夜存档.json');
  assert.ok(exported);
  const exportText = await exported.text();
  assert.deepEqual(JSON.parse(exportText).paintingMemories, [memory()]);
  raw = exportText;
  assert.deepEqual(loadSave().save.paintingMemories, [memory()]);
});
