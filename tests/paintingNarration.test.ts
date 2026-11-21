import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { findMentionedPainting } from '../src/lib/paintings.ts';
import { paintingNarration } from '../src/lib/paintingNarration.ts';

test('standing room painting cues select the author and a distinct local clip for each subtitle', () => {
  for (const [artistId, cues] of [
    ['vincent', ['想看星空', '星 月 夜']],
    ['dali', ['达利的永恒的记忆', '记忆的永恒']],
  ] as const) {
    for (const cue of cues) {
      const work = findMentionedPainting(cue);
      assert.ok(work);
      assert.equal(work.artistId, artistId);
      const clips = paintingNarration[work.id];
      assert.ok(clips && clips.length >= 2);
      assert.equal(new Set(clips.map(c => c.audio)).size, clips.length);
      for (const clip of clips) {
        assert.ok(clip.text.trim());
        assert.ok(clip.audio.startsWith('/audio/dialogue/' + artistId + '-'));
        assert.ok(statSync(new URL('../public' + clip.audio, import.meta.url)).size > 1000);
      }
    }
  }
});

test('declining the night sky or mentioning ordinary memories keeps the conversation in the room', () => {
  for (const line of ['先别看星空', '星空先不要展示', '别给我看永恒的记忆', '我的记忆好吗？']) {
    assert.equal(findMentionedPainting(line), null, line);
  }
});
