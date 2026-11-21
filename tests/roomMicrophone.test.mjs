import test from 'node:test';
import assert from 'node:assert/strict';
import { MicUtterance } from '../src/lib/roomMicrophone.ts';

test('local capture keeps the first syllable and closes only after a real pause', () => {
  const utterance = new MicUtterance(48000);
  const quiet = new Float32Array(1536);
  const voiced = new Float32Array(1536).fill(.2);
  for (let n=0; n<400; n++) assert.equal(utterance.add(quiet), false);
  assert.equal(utterance.started, false);
  utterance.add(voiced); utterance.add(voiced);
  assert.equal(utterance.started, true);
  for (let n=0; n<15; n++) assert.equal(utterance.add(quiet), false);
  assert.equal(utterance.add(voiced), false);
  for (let n=0; n<22; n++) assert.equal(utterance.add(quiet), false);
  assert.equal(utterance.add(quiet), true);
  const pcm = new Int16Array(utterance.pcm());
  assert.ok(pcm.length < 16000*2);
  assert.equal(pcm.filter(x=>x>6500).length, 3*512);
});
