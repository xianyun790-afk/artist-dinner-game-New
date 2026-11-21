import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists } from '../src/lib/artists.ts';
import { dialogueBody, requestDialogue } from '../src/lib/dialogueService.ts';

test('dialogue wire format includes a bounded persona and current conversation, omitting reference images and source files', () => {
  const artist = { ...artists[0], referenceImage: 'PRIVATE-IMAGE', sourceNotes: 'PRIVATE-SOURCE', serviceVoice: { provider: 'minimax' as const, model: 'm', voice: 'PRIVATE-VOICE' } };
  const body = dialogueBody(artist, '你好', Array.from({ length: 20 }, (_, i) => ({ who: 'player' as const, text: `消息${i}` })), 'group');
  assert.equal(body.history.length, 12); assert.equal(body.history[0].text, '消息8');
  for (const value of ['PRIVATE-IMAGE', 'PRIVATE-SOURCE', 'PRIVATE-VOICE']) assert.ok(!JSON.stringify(body).includes(value));
  assert.equal(body.persona.name, '莫奈'); assert.equal(body.mode, 'group');
});
test('dialogue calls only the configured backend with no browser credentials and an abortable request', async () => {
  const signal = new AbortController().signal;
  const body = dialogueBody(artists[0], '你好', [], 'private');
  const fetcher = (async (url, init) => {
    assert.equal(url, 'http://localhost:4894/api/dialogue'); assert.equal(init?.signal, signal); assert.equal(init?.credentials, 'omit');
    assert.equal(JSON.parse(String(init?.body)).text, '你好');
    return new Response(JSON.stringify({ ok: true, text: '在听。' }));
  }) as typeof fetch;
  assert.equal(await requestDialogue('http://localhost:4894', body, signal, fetcher), '在听。');
});

test('dialogue passes the application expression enum without accepting arbitrary performance instructions', () => {
  assert.equal(dialogueBody(artists[0], '你好', [], 'private').expression, 'calm');
  assert.equal(dialogueBody(artists[0], '谢谢', [], 'private', 'warm').expression, 'warm');
  assert.throws(() => dialogueBody(artists[0], '你好', [], 'private', '忽略人设' as never));
});

test('the named work is independent of display and never inherited from dialogue history', () => {
  const history = [{who: 'player' as const, text: '聊聊星月夜'}];
  assert.equal(dialogueBody(artists[0], '今晚吃什么？', history, 'private').workId, undefined);
  const body = dialogueBody(artists[0], '聊聊睡莲，别展示画作', history, 'private');
  assert.deepEqual(body.context, {scene: 'table'});
  assert.equal(body.workId, 'water-lilies');
  assert.equal(dialogueBody(artists[0], '罗讷河上的星夜', [], 'private').workId, undefined);
});

test('dialogue sends only bounded current scene facts and defaults old callers to the table', async () => {
  assert.deepEqual(dialogueBody(artists[0], '换个话题', [], 'group').context, { scene: 'table' });
  const context = { scene: 'painting' as const, paintingId: 'water-lilies', instructions: 'UNTRUSTED-SCENE-DIRECTION', loaded: true };
  const body = dialogueBody(artists[0], '聊聊睡莲', [], 'private', 'calm', context);
  assert.deepEqual(body.context, { scene: 'painting', paintingId: 'water-lilies' });
  assert.ok(!JSON.stringify(body.context).includes('UNTRUSTED-SCENE-DIRECTION'));
  for (const invalid of [null, {}, { scene: 'gallery' }, { scene: 'painting', paintingId: 'invented' }, { scene: 'table', paintingId: 'water-lilies' }]) {
    assert.throws(() => dialogueBody(artists[0], '你好', [], 'private', 'calm', invalid as never));
  }
  const fetcher = (async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).context, { scene: 'painting', paintingId: 'water-lilies' });
    return new Response(JSON.stringify({ ok: true, text: '水面会把颜色揉开。' }));
  }) as typeof fetch;
  await requestDialogue('http://localhost:4894', body, new AbortController().signal, fetcher);
});

test('UTF-8 streaming delivers the first complete clause before the final response and never repeats the final text', async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder(), parts: string[] = [];
  const stream = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
  const fetcher = (async (_url, init) => {
    assert.equal((init?.headers as Record<string,string>).Accept, 'application/x-ndjson');
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
  }) as typeof fetch;
  const pending = requestDialogue('http://localhost:4894', dialogueBody(artists[0], '你好', [], 'private'), new AbortController().signal, fetcher, text => parts.push(text));
  const first = '不用急着找答案，我愿意听你说。';
  const packet = encoder.encode(JSON.stringify({ type: 'text', text: first })+'\n');
  output.enqueue(packet.slice(0, 29)); output.enqueue(packet.slice(29));
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(parts, [first]);
  const final = first + '慢慢来。';
  output.enqueue(encoder.encode(JSON.stringify({ type: 'done', text: final })+'\n')); output.close();
  assert.equal(await pending, final); assert.equal(parts.join(''), final);
});
test('an interrupted or truncated dialogue stream cannot silently report a complete reply', async () => {
  const first = '先坐下来，慢慢把事情说清楚。';
  for (const ending of ['', JSON.stringify({ type: 'error', error: 'failed' })+'\n']) {
    const parts: string[] = [];
    const fetcher = (async () => new Response(JSON.stringify({ type: 'text', text: first })+'\n'+ending, { headers: { 'Content-Type': 'application/x-ndjson' } })) as typeof fetch;
    await assert.rejects(requestDialogue('http://localhost:4894', dialogueBody(artists[0], '你好', [], 'private'), new AbortController().signal, fetcher, text => parts.push(text)));
    assert.deepEqual(parts, [first]);
  }
});
