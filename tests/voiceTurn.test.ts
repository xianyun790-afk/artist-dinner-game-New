import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceTurn, type VoiceInputTiming } from '../src/lib/voiceTurn.ts';

function harness() {
  let now = 100, id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const drafts: string[] = [], sent: { text: string; timing: VoiceInputTiming }[] = [];
  const turn = createVoiceTurn({
    onDraft: text => drafts.push(text), onSubmit: (text, timing) => sent.push({ text, timing }), now: () => now,
    schedule: (run, delay) => { const key = ++id; timers.set(key, { at: now + delay, run }); return key as unknown as ReturnType<typeof setTimeout>; },
    unschedule: key => { timers.delete(key as unknown as number); },
  });
  return { turn, drafts, sent, advance: (ms: number) => {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].run();
    }
    now = end;
  } };
}
const final = (text: string) => ({ isFinal: true, 0: { transcript: text } });
const partial = (text: string) => ({ isFinal: false, 0: { transcript: text } });

test('interim revisions and repeated result snapshots are displayed once and submit one complete turn', () => {
  const h = harness(); h.turn.speechStart();
  h.turn.results([partial('我今天去公')]); h.advance(120);
  h.turn.results([partial('我今天去公园')]); h.advance(120);
  h.turn.results([final('我今天去公园。')]); h.advance(100);
  h.turn.results([final('我今天去公园。')]); h.advance(259);
  assert.equal(h.sent.length, 0);
  h.turn.speechEnd(); h.advance(1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].text, '我今天去公园。');
  assert.equal(h.sent[0].timing.endpointDelayMs, 360);
  assert.equal(h.sent[0].timing.inputStartedAt, 100);
  assert.equal(h.sent[0].timing.inputEndedAt, 699);
  h.turn.results([final('重复的迟到结果')]); h.advance(1000);
  assert.equal(h.sent.length, 1);
});

test('a continuation during the endpoint grace joins the self-correction before replying', () => {
  const h = harness(); h.turn.speechStart(); h.turn.results([final('我刚才在公园。')]); h.advance(240);
  h.turn.speechStart(); h.turn.results([final('我刚才在公园。'), partial('不对')]); h.advance(800);
  assert.equal(h.sent.length, 0);
  h.turn.results([final('我刚才在公园。'), final('不对，是地铁。')]); h.advance(360);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].text, '我刚才在公园。不对，是地铁。');
});

test('a repeated old final cannot submit while a resumed phrase awaits its transcript', () => {
  const h = harness(); h.turn.speechStart(); h.turn.results([final('我想聊睡莲。')]); h.advance(200);
  h.turn.speechStart(); h.advance(40); h.turn.results([final('我想聊睡莲。')]); h.advance(800);
  assert.equal(h.sent.length, 0);
  h.turn.results([final('我想聊睡莲。'), partial('还有')]); h.advance(400);
  assert.equal(h.sent.length, 0);
  h.turn.results([final('我想聊睡莲。'), final('还有它的颜色。')]); h.advance(360);
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].text, '我想聊睡莲。还有它的颜色。');
});

test('speech ending without a new transcript gives delayed results a fresh grace period', () => {
  const h = harness(); h.turn.results([final('我想聊睡莲。')]); h.advance(200);
  h.turn.speechStart(); h.turn.results([final('我想聊睡莲。')]); h.advance(800);
  h.turn.speechEnd(); h.advance(359); assert.equal(h.sent.length, 0);
  h.turn.results([final('我想聊睡莲。'), final('不对，先聊星空。')]); h.advance(360);
  assert.equal(h.sent[0].text, '我想聊睡莲。不对，先聊星空。');
});

test('browser auto-end during an interim continuation keeps time for the restarted session', () => {
  const h = harness(); h.turn.results([final('我想说，')]); h.advance(100);
  h.turn.speechStart(); h.turn.results([final('我想说，'), partial('今天')]); h.advance(500);
  h.turn.sessionEnded(); h.advance(100); h.turn.speechStart();
  h.turn.results([partial('今天先不画画')]); h.advance(500);
  assert.equal(h.sent.length, 0);
  h.turn.results([final('今天先不画画。')]); h.advance(360);
  assert.equal(h.sent[0].text, '我想说，今天先不画画。');
});

test('browser auto-end and restart retain finals without discarding the remaining grace period', () => {
  const h = harness(); h.turn.results([final('我想说，')]); h.advance(100); h.turn.sessionEnded();
  h.advance(100); h.turn.speechStart(); h.turn.results([partial('今天')]); h.advance(500);
  h.turn.results([final('今天先不画画。')]); h.advance(360);
  assert.equal(h.sent[0].text, '我想说，今天先不画画。');
  assert.equal(h.sent[0].timing.inputEndedAt, undefined);
});

test('cancel before a pending endpoint or a late recognition event never sends a stale turn', () => {
  const h = harness(); h.turn.results([final('不应该发送')]); h.advance(200); h.turn.cancel();
  h.turn.sessionEnded(); h.turn.results([final('迟到')]); h.advance(1000);
  assert.equal(h.sent.length, 0); assert.equal(h.drafts.at(-1), '');
});

test('unconfirmed interim-only recognition is never sent as an invented final transcript', () => {
  const h = harness(); h.turn.results([partial('可能听错了')]); h.turn.sessionEnded(); h.advance(1000);
  assert.equal(h.sent.length, 0);
});
