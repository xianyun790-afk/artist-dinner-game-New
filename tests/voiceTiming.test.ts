import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTiming } from '../src/lib/voiceTiming.ts';

test('request timings never claim acoustic latency without a browser speech-end event', () => {
  let now = 100;
  const clock = createVoiceTiming(100, undefined, () => now);
  now = 200; clock.mark('firstSentenceMs');
  now = 500; clock.mark('firstPreparedMs');
  now = 550; clock.mark('firstAudioMs');
  assert.deepEqual(clock.snapshot(), { firstSentenceMs: 100, firstPreparedMs: 400, firstAudioMs: 450 });
});
test('browser-estimated end-to-audio includes ASR endpoint grace; repeated chunks cannot reset the first audio', () => {
  let now = 1600;
  const clock = createVoiceTiming(1000, { source: 'browser-asr', inputStartedAt: 0, inputEndedAt: 500, finalResultAt: 640, submittedAt: 1000, endpointDelayMs: 360 }, () => now);
  clock.mark('firstAudioMs'); now = 2200; clock.mark('firstAudioMs');
  assert.deepEqual(clock.snapshot(), { endpointDelayMs: 360, firstAudioMs: 600, browserSpeechEndToAudioMs: 1100 });
});
test('invalid or backwards timestamps do not produce misleading latency values', () => {
  const clock = createVoiceTiming(1000, { source: 'browser-asr', inputStartedAt: 0, inputEndedAt: 1100, finalResultAt: 500, submittedAt: 1000, endpointDelayMs: -1 }, () => 900);
  clock.mark('firstAudioMs'); assert.deepEqual(clock.snapshot(), {});
});
