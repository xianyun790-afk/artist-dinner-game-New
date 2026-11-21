import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, speechParts } from '../src/lib/speechQueue.ts';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('speech starts with the first ready sentence while the reply is still arriving; later audio never overtakes it', async () => {
  const first = deferred<string>(), second = deferred<string>(), playback = deferred<void>();
  const prepared: string[] = [], played: string[] = [];
  const queue = createSpeechQueue({ signal: new AbortController().signal,
    prepare: text => { prepared.push(text); return text === '第一句' ? first.promise : second.promise; },
    play: async audio => { played.push(audio); if (audio === 'first') await playback.promise; },
  });
  queue.push('第一句'); queue.push('第二句');
  assert.deepEqual(prepared, ['第一句', '第二句']);
  second.resolve('second'); await tick(); assert.deepEqual(played, []);
  first.resolve('first'); await tick(); assert.deepEqual(played, ['first']);
  // Generation need not have called end() before audio begins.
  queue.end(); playback.resolve(); await queue.done;
  assert.deepEqual(played, ['first', 'second']);
});
test('at most two syntheses are in flight and cancellation discards late audio without starting another sentence', async () => {
  const controller = new AbortController(), pending = deferred<string>();
  let prepared = 0, played = 0;
  const queue = createSpeechQueue({ signal: controller.signal,
    prepare: async () => { prepared++; return pending.promise; }, play: async () => { played++; },
  });
  queue.push('一'); queue.push('二'); queue.push('三');
  assert.equal(prepared, 2); controller.abort(); await queue.done;
  pending.resolve('late'); await tick();
  assert.equal(prepared, 2); assert.equal(played, 0);
});
test('a new streamed sentence cannot oversubscribe a slot released to an awaiting synthesis', async () => {
  const controller = new AbortController(), gates = new Map(['A', 'B', 'C', 'D'].map(text => [text, deferred<string>()]));
  let active = 0, peak = 0;
  const prepared: string[] = [], played: string[] = [];
  const queue = createSpeechQueue({ signal: controller.signal,
    prepare: async text => {
      prepared.push(text); active++; peak = Math.max(peak, active);
      try { return await gates.get(text)!.promise; } finally { active--; }
    }, play: async text => { played.push(text); },
  });
  queue.push('A'); queue.push('B'); queue.push('C');
  gates.get('A')!.resolve('A');
  // A releases its slot, but C has not yet resumed through Promise.race.
  await Promise.resolve(); await Promise.resolve();
  queue.push('D');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(peak, 2); assert.equal(active, 2);
  queue.end(); for (const [text, gate] of gates) gate.resolve(text);
  await queue.done;
  assert.equal(peak, 2); assert.equal(prepared.length, 4);
  assert.deepEqual(played, ['A', 'B', 'C', 'D']);
});
test('cancelling during slot reacquisition resolves without starting a late waiting synthesis', async () => {
  const controller = new AbortController(), gates = new Map(['A', 'B', 'C', 'D'].map(text => [text, deferred<string>()]));
  const prepared: string[] = [], played: string[] = [];
  const queue = createSpeechQueue({ signal: controller.signal,
    prepare: async text => { prepared.push(text); return await gates.get(text)!.promise; },
    play: async text => { played.push(text); },
  });
  queue.push('A'); queue.push('B'); queue.push('C');
  gates.get('A')!.resolve('A'); await Promise.resolve(); await Promise.resolve();
  queue.push('D'); controller.abort(); await queue.done;
  const heardBeforeLateResults = [...played];
  for (const [text, gate] of gates) gate.resolve(text);
  await tick();
  assert.deepEqual(prepared, ['A', 'B', 'D']);
  assert.deepEqual(played, heardBeforeLateResults);
});
test('interrupting playback resolves the queue and prevents remaining ready audio from playing', async () => {
  const controller = new AbortController(), playing = deferred<void>(); const heard: string[] = [];
  const queue = createSpeechQueue({ signal: controller.signal, prepare: async text => text,
    play: async text => { heard.push(text); await playing.promise; },
  });
  queue.push('一'); queue.push('二'); queue.end(); await tick();
  controller.abort(); await queue.done; playing.resolve(); await tick();
  assert.deepEqual(heard, ['一']);
});
test('sentence boundaries preserve all characters, combine tiny clauses and flush a short final reply', () => {
  const text = '好。先坐一会儿，今天不用急着做出决定。慢慢说，我在听。';
  const first = speechParts(text.slice(0, 22));
  const last = speechParts(first.rest + text.slice(22), true);
  assert.equal([...first.parts, ...last.parts].join('') + last.rest, text);
  assert.equal(speechParts('好的。').parts.length, 0);
  assert.deepEqual(speechParts('好的。', true).parts, ['好的。']);
  const long = speechParts('一'.repeat(140), true);
  assert.ok(long.parts.every(part => part.length <= 48));
  assert.equal(long.parts.join(''), '一'.repeat(140));
});

test('continuation sentences retain a complete thought beyond the first-audio chunk limit', () => {
  const thought = '我想保留水面上那些很轻的变化，' + '一'.repeat(42) + '，让它们连在一起。';
  assert.ok(thought.length > 48 && thought.length < 96);
  assert.deepEqual(speechParts(thought, false, 96), { parts: [thought], rest: '' });
  const unfinished = thought.slice(0, -1);
  assert.deepEqual(speechParts(unfinished, false, 96), { parts: [], rest: unfinished });
  assert.equal(speechParts(unfinished, true, 96).parts.join(''), unfinished);
});
