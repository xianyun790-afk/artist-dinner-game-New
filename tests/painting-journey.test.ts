import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaintingJourney, PAINTING_JOURNEY_TIMING } from '../src/lib/paintingJourney.ts';
import { starryNight, waterLilies } from '../src/lib/paintings.ts';
import type { PaintingMemory } from '../src/lib/types';
import { artists } from '../src/lib/artists.ts';
import { groupReplies, playGroupRound } from '../src/lib/groupChat.ts';

function setup() {
  let time = 0, id = 0;
  const tasks = new Map<number, { at: number; run: () => void }>();
  const archived: PaintingMemory[] = [];
  const journey = createPaintingJourney({
    onArchive: memory => archived.push(memory),
    now: () => new Date('2026-11-09T13:00:00.000Z'),
    timers: { set(run, delay) { const key = ++id; tasks.set(key, { at: time + delay, run }); return key; }, clear(key) { tasks.delete(key as number); } },
  });
  const tick = (duration: number) => {
    const until = time + duration;
    for (;;) {
      const next = [...tasks.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      tasks.delete(next[0]); time = next[1].at; next[1].run();
    }
    time = until;
  };
  return { journey, archived, tick };
}
const explanation = { speakerId: 'vincent', question: '聊聊星月夜', explanation: '柏树伸向夜空。', night: 1 };
const { frame, file } = PAINTING_JOURNEY_TIMING;

test('completed narration remains in the painting until explicit exit immediately frames it', () => {
  const { journey, archived, tick } = setup();
  journey.begin('turn-1', '聊聊星月夜'); journey.loaded(starryNight.id); journey.finish('turn-1', explanation, true);
  tick(10_000); assert.equal(journey.state.phase, 'viewing'); assert.equal(journey.state.finishing, false); assert.equal(archived.length, 0);
  journey.exit(); assert.equal(journey.state.phase, 'framing'); assert.equal(journey.state.finishing, true);
  tick(frame - 1); assert.equal(archived.length, 0);
  tick(1); assert.equal(journey.state.phase, 'filing'); assert.equal(archived.length, 1);
  assert.deepEqual(archived[0], { id: 'turn-1', paintingId: starryNight.id, ...explanation, createdAt: '2026-11-09T13:00:00.000Z' });
  tick(file); assert.equal(journey.state.painting, null); assert.equal(journey.state.suppressed, true); assert.equal(journey.state.finishing, false);
});

test('exit freezes heard-only progress before completion and ignores later text and repeated exits', () => {
  const { journey, archived, tick } = setup();
  journey.begin('partial', '星月夜'); journey.loaded(starryNight.id);
  journey.capture('partial', { ...explanation, explanation: '已经听到的半句。' }); journey.exit();
  assert.equal(journey.state.phase, 'framing');
  journey.capture('partial', { ...explanation, explanation: '不应保存的后续台词。' });
  journey.finish('partial', explanation, true); journey.exit(); journey.loaded(starryNight.id);
  tick(frame); assert.equal(archived.length, 1); assert.equal(archived[0].explanation, '已经听到的半句。');
  tick(file + frame); assert.equal(archived.length, 1); assert.equal(journey.state.painting, null);
});

test('exiting before the first spoken sentence can keep a painting with an empty explanation', () => {
  const { journey, archived, tick } = setup();
  journey.begin('silent', '星月夜'); journey.capture('silent', { ...explanation, explanation: '' }); journey.loaded(starryNight.id);
  journey.exit(); tick(frame); assert.equal(archived.length, 1); assert.equal(archived[0].explanation, '');
});

test('a quiet group can collect a painting without generating a narration', async () => {
  const { journey, archived, tick } = setup();
  const input = '大家安静，给我看看星月夜', members = artists.slice(0, 2);
  const replies = groupReplies(input, members, [], null);
  assert.equal(replies.length, 0);
  journey.begin('quiet-group', input);
  journey.capture('quiet-group', { speakerId: members[0].id, question: input, explanation: '', night: 1 });
  const unexpected = () => { assert.fail('a quiet group must not generate or play a reply'); };
  await playGroupRound(replies, new AbortController().signal, {
    thinking: unexpected, present: unexpected, speak: async () => unexpected(), pause: async () => unexpected(),
  });
  journey.loaded(starryNight.id); journey.exit(); tick(frame);
  assert.equal(archived.length, 1); assert.equal(archived[0].paintingId, starryNight.id);
  assert.equal(archived[0].question, input); assert.equal(archived[0].explanation, '');
});

test('metadata captured before an assistant title is still available when the painting opens', () => {
  const { journey, archived, tick } = setup();
  journey.begin('introduced', '聊聊夜色'); journey.capture('introduced', explanation);
  journey.notice('introduced', '说到星月夜'); journey.loaded(starryNight.id); journey.exit(); tick(frame);
  assert.equal(archived.length, 1); assert.equal(archived[0].paintingId, starryNight.id);
});

test('image must load by the end of framing and a failed image closes without saving', () => {
  for (const scenario of ['never-loaded', 'fails-before', 'fails-during', 'loads-during'] as const) {
    const { journey, archived, tick } = setup();
    journey.begin(scenario, '星月夜'); journey.capture(scenario, explanation);
    if (scenario === 'fails-before') journey.failed(starryNight.id);
    journey.exit();
    if (scenario === 'fails-before') { assert.equal(journey.state.painting, null); continue; }
    assert.equal(journey.state.phase, 'framing', scenario);
    if (scenario === 'fails-during') journey.failed(starryNight.id);
    if (scenario === 'loads-during') journey.loaded(starryNight.id);
    tick(frame); assert.equal(archived.length, scenario === 'loads-during' ? 1 : 0, scenario);
    tick(file); assert.equal(journey.state.painting, null, scenario);
    journey.loaded(starryNight.id); tick(10_000); assert.equal(archived.length, scenario === 'loads-during' ? 1 : 0);
  }
});

test('incomplete final replies preserve the last captured progress without auto framing', () => {
  const { journey, archived, tick } = setup();
  journey.begin('incomplete', '星月夜'); journey.loaded(starryNight.id);
  journey.capture('incomplete', { ...explanation, explanation: '实际听过的话。' });
  journey.finish('incomplete', explanation, false); tick(10_000);
  assert.equal(journey.state.phase, 'viewing'); assert.equal(archived.length, 0);
  journey.exit(); tick(frame); assert.equal(archived[0].explanation, '实际听过的话。');
});

test('hiding the page preserves complete or partial narration for exit and freezes late callbacks', () => {
  for (const completed of [false, true]) {
    const { journey, archived, tick } = setup();
    journey.begin('hidden', '星月夜'); journey.loaded(starryNight.id);
    const heard = { ...explanation, explanation: completed ? '已经听完的讲解。' : '已经听到的前一句。' };
    journey.capture('hidden', heard);
    journey.finish('hidden', heard, completed);
    journey.pause();
    journey.capture('hidden', { ...explanation, explanation: '迟到的后半句。' });
    journey.finish('hidden', explanation, true); journey.notice('hidden', '睡莲');
    tick(10_000);
    assert.equal(journey.state.painting, starryNight);
    assert.equal(archived.length, 0);
    journey.exit(); tick(frame);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].explanation, heard.explanation);
    tick(file); assert.equal(journey.state.painting, null);
  }
});

test('a paused turn cannot open a late painting and a new turn accepts its own progress', () => {
  const { journey, archived, tick } = setup();
  journey.begin('old-hidden', '聊聊夜色'); journey.capture('old-hidden', explanation); journey.pause();
  journey.notice('old-hidden', '星月夜'); assert.equal(journey.state.painting, null);
  journey.begin('new-visible', '看看睡莲'); journey.loaded(waterLilies.id);
  journey.capture('new-visible', { ...explanation, speakerId: 'monet', explanation: '新一轮讲解。' });
  journey.capture('old-hidden', explanation); journey.finish('old-hidden', explanation, true);
  journey.exit(); tick(frame);
  assert.equal(archived.length, 1); assert.equal(archived[0].id, 'new-visible');
  assert.equal(archived[0].paintingId, waterLilies.id); assert.equal(archived[0].explanation, '新一轮讲解。');
});

test('hiding during framing leaves the pending archive intact', () => {
  const { journey, archived, tick } = setup();
  journey.begin('closing-hidden', '星月夜'); journey.loaded(starryNight.id); journey.capture('closing-hidden', explanation);
  journey.exit(); journey.pause(); tick(frame + file);
  assert.equal(archived.length, 1); assert.equal(journey.state.painting, null);
});

test('cancel and leave invalidate progress; cancellation during closing removes pending archive', () => {
  for (const action of ['cancel', 'leave'] as const) {
    const { journey, archived, tick } = setup();
    journey.begin('turn-1', '星月夜'); journey.loaded(starryNight.id); journey.capture('turn-1', explanation); journey.exit();
    journey[action](); tick(10_000); journey.finish('turn-1', explanation, true); tick(10_000);
    assert.equal(archived.length, 0, action); assert.equal(journey.state.painting, null); assert.equal(journey.state.token, null); assert.equal(journey.state.finishing, false);
  }
  const { journey, archived, tick } = setup();
  journey.begin('cancel-view', '星月夜'); journey.capture('cancel-view', explanation); journey.cancel();
  assert.equal(journey.state.painting, starryNight); journey.loaded(starryNight.id); journey.exit(); tick(frame);
  assert.equal(archived.length, 0); assert.equal(journey.state.painting, null);
});

test('newer turns invalidate old callbacks and replace a pending frame', () => {
  const { journey, archived, tick } = setup();
  journey.begin('old', '星月夜'); journey.loaded(starryNight.id); journey.capture('old', explanation); journey.exit();
  journey.begin('new', '再看睡莲'); journey.capture('old', explanation); journey.notice('old', '星月夜'); journey.finish('old', explanation, true);
  assert.equal(journey.state.finishing, false); tick(10_000); assert.equal(archived.length, 0); assert.equal(journey.state.painting, waterLilies);
  journey.loaded(waterLilies.id); journey.capture('new', { ...explanation, speakerId: 'monet' }); journey.exit(); tick(frame);
  assert.equal(archived.length, 1); assert.equal(archived[0].id, 'new'); assert.equal(archived[0].paintingId, waterLilies.id);
});

test('declining display suppresses mentions and later speech cannot reopen a left scene', () => {
  const { journey, archived, tick } = setup();
  journey.begin('first', '不要展示图片，只聊星月夜'); journey.capture('first', explanation); journey.notice('first', '星月夜里的柏树'); journey.exit(); tick(10_000);
  assert.equal(journey.state.painting, null); assert.equal(archived.length, 0);
  journey.begin('second', '再看星月夜'); journey.leave(); journey.notice('second', '星月夜'); assert.equal(journey.state.painting, null);
  journey.begin('third', '接着说'); journey.notice('third', '星月夜'); assert.equal(journey.state.painting, null);
});

test('replay exit also frames the image while remaining unable to duplicate a memory', () => {
  const { journey, archived, tick } = setup();
  journey.begin('old', '星月夜'); journey.capture('old', explanation); journey.replay(waterLilies); journey.loaded(waterLilies.id);
  journey.capture('old', explanation); journey.notice('old', '星月夜'); journey.finish('old', explanation, true); tick(10_000);
  assert.equal(journey.state.phase, 'replay'); journey.exit(); assert.equal(journey.state.phase, 'framing'); assert.equal(journey.state.finishing, true);
  journey.exit(); tick(frame + file); assert.equal(journey.state.painting, null); assert.equal(archived.length, 0);
});

test('filing cancellation preserves the already archived memory without duplicating it', () => {
  const { journey, archived, tick } = setup();
  journey.begin('once', '星月夜'); journey.loaded(starryNight.id); journey.capture('once', explanation); journey.exit(); tick(frame);
  assert.equal(archived.length, 1); journey.finish('once', explanation, true); journey.exit(); journey.cancel(); tick(10_000);
  assert.equal(archived.length, 1); assert.equal(journey.state.token, null);
});

test('ordinary follow-ups retain the visible painting and disposal removes pending work', () => {
  const { journey, archived, tick } = setup();
  journey.begin('first', '星月夜'); journey.begin('follow-up', '那棵树呢？'); assert.equal(journey.state.painting, starryNight);
  journey.loaded(starryNight.id); journey.capture('follow-up', explanation); journey.exit(); journey.dispose(); tick(10_000); assert.equal(archived.length, 0);
});

test('begin returns the current scene synchronously for one consistent dialogue-round context', () => {
  const { journey, tick } = setup();
  const viewing = journey.begin('scene-first', '星月夜');
  assert.equal(viewing.painting, starryNight);
  journey.loaded(starryNight.id); journey.capture('scene-first', explanation); journey.exit(); tick(frame + file);
  const table = journey.begin('scene-next', '换个话题，今天想做什么？');
  assert.equal(table.painting, null);
  journey.notice('scene-next', '想再看看睡莲');
  assert.equal(journey.state.painting, null, 'the explicit exit still suppresses incidental assistant titles');
  assert.equal(table.painting, null, 'round context remains the initial snapshot');
});
