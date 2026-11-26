import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {cafeReflection, recordedDialogue} from '../src/lib/standingDialogue.ts';
import conversations from '../src/lib/standingDialogue.json' with {type:'json'};

test('each offline question resolves to a bundled recording for its own artist', async () => {
  assert.deepEqual(new Set(conversations.map(row => row.artistId)), new Set(['vincent', 'dali', 'georgia']));
  for (const row of conversations) {
    assert.equal(recordedDialogue(row.artistId, row.artistName + '，' + row.questions[0] + '？')?.text, row.text);
    for (const question of row.questions) assert.equal(recordedDialogue(row.artistId, question)?.audio, row.audio);
    assert.ok((await stat(new URL('../public' + row.audio, import.meta.url))).size > 3000);
  }
  assert.notEqual(recordedDialogue('dali','你会怎么画一盏灯')?.audio,recordedDialogue('vincent','你会怎么画一盏灯')?.audio);
  assert.equal(recordedDialogue('dali','莫奈，你会怎么画一盏灯？'), undefined);
  assert.equal(recordedDialogue('vincent','画里的那个人问“你累了吗”是什么意思？'), undefined);
});

test('returning from the café remembers the lamp change in either language', async () => {
  for (const lang of ['zh', 'en'] as const) {
    assert.equal(cafeReflection('unchanged', lang), undefined);
    const dimmed = cafeReflection('dimmed', lang)!;
    const relit = cafeReflection('relit', lang)!;
    assert.notEqual(dimmed.text, relit.text);
    for (const { audio } of [dimmed, relit]) {
      assert.ok((await stat(new URL('../public' + audio, import.meta.url))).size > 3000);
    }
  }
});
