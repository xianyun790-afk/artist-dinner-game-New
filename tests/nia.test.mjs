import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signNiaToken, buildPersonaPrompt, generateNiaReply } from '../server/nia.mjs';
import { artistPersonas, personaRules } from '../server/personas.mjs';
import { dialogueInput } from '../server/dialogueInput.mjs';
const config = { accessKey: 'test-access', secretKey: 'test-only-secret', model: 'test-model' };
function socketMock(scenario = 'ok') {
  class Mock extends EventTarget {
    static instances = [];
    readyState = 0; sent = []; closed = false;
    constructor(url) { super(); this.url = url; Mock.instances.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    emit(data) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
    send(raw) {
      const data = JSON.parse(raw); this.sent.push(data);
      queueMicrotask(() => {
        if (this.closed) return;
        if (data.type === 'CreateSession') this.emit({ type: 'CreateSessionResult', success: true, session_id: 'test-session' });
        if (data.type === 'ConfigPipeline') this.emit({ type: scenario === 'reject' ? 'ConfigRejected' : 'ConfigUpdated' });
        if (data.type === 'PostMultimodalGenerate') {
          if (scenario === 'hang') return;
          if (scenario === 'blocked') { this.emit({ type: 'ResponseBlocked' }); return; }
          if (scenario === 'report') { this.emit({ type: 'Report', code: 403, level: 'error', content: 'SENSITIVE-UPSTREAM' }); return; }
          this.emit({ type: 'ResponseStartTextStream', index: 1 });
          this.emit({ type: 'ResponseTextSegment', index: 1, text: '你好。' });
          this.emit({ type: 'ResponseTextSegment', index: 1, text: '我在听。' });
          this.emit({ type: 'ResponseEndTextStream', index: 1, complete: true, text: '你好。我在听。' });
        }
      });
    }
    close() { this.closed = true; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return Mock;
}
const options = { config, persona: { name: '莫奈', personality: '慢热' }, text: '你好', history: [], mode: 'private' };
test('JWT is server-signed with short expiry and does not embed the secret', () => {
  const jwt = signNiaToken(config.accessKey, config.secretKey, 1000000), [head, body, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), { iss: 'test-access', exp: 1180, nbf: 995 });
  assert.equal(signature, createHmac('sha256', config.secretKey).update(`${head}.${body}`).digest('base64url'));
  assert.ok(!jwt.includes(config.secretKey));
});
test('NIA uses the documented session lifecycle and returns one completed text without a duplicate ending', async () => {
  const Socket = socketMock();
  const updates = [];
  assert.equal(await generateNiaReply({ ...options, onText: text => updates.push(text) }, Socket), '你好。我在听。');
  assert.deepEqual(updates, ['你好。', '你好。我在听。']);
  const socket = Socket.instances[0];
  assert.deepEqual(socket.sent.map(m => m.type), ['CreateSession', 'ConfigPipeline', 'StartServing', 'PostMultimodalGenerate']);
  assert.equal(socket.sent[1].custom_config.tts.enabled, false);
  assert.equal(socket.sent[1].custom_config.websearch.enabled, false);
  assert.equal(socket.closed, true);
});
test('group prompt and wire context include only supplied group messages, with no application tools', async () => {
  const Socket = socketMock(); const history = [{ who: 'artist', name: '梵高', text: '我喜欢黄。' }];
  await generateNiaReply({ ...options, mode: 'group', history }, Socket);
  const socket = Socket.instances[0];
  assert.match(socket.sent[1].custom_config.system_prompt, /不能提及或猜测任何私聊/);
  assert.equal(socket.sent[1].custom_config.fn_call, undefined);
  assert.deepEqual(JSON.parse(socket.sent[3].text), { recentConversation: history, playerMessage: '你好' });
  assert.match(buildPersonaPrompt(options.persona), /没有任何操作工具/);
});

test('validated current scene reaches NIA and overrides old artwork history without declaring loaded images', async () => {
  const history = [{ who: 'player', text: '大家安静，给我看看星月夜' }];
  for (const context of [{ scene: 'table' }, { scene: 'painting', paintingId: 'starry-night' }]) {
    const payload = dialogueInput({ ...options, history, text: '大家，随便聊聊你们今天想做的事，每人一句。', mode: 'group', context });
    const Socket = socketMock();
    await generateNiaReply({ ...payload, config }, Socket);
    const prompt = Socket.instances[0].sent[1].custom_config.system_prompt;
    assert.match(prompt, /玩家可以随时换话题/);
    assert.match(prompt, context.scene === 'table' ? /当前场景是餐桌/ : /本轮界面已请求展示《星月夜》/);
    if (context.scene === 'painting') assert.match(prompt, /不表示图片已经加载/);
    assert.deepEqual(JSON.parse(Socket.instances[0].sent[3].text), { recentConversation: history, playerMessage: payload.text });
  }
});
test('each built-in prompt receives only its own authored persona, while a namesake custom artist keeps an independent identity', () => {
  for (const [id, card] of Object.entries(artistPersonas)) {
    const prompt = buildPersonaPrompt({ id, name: card.name });
    assert.ok(prompt.includes(card.core)); assert.ok(prompt.includes(card.boundary));
    assert.match(prompt, /只示范该角色的语气和长短/);
    for (const [otherId, other] of Object.entries(artistPersonas)) if (otherId !== id) assert.ok(!prompt.includes(other.core));
  }
  const custom = { id: 'custom-monet', name: '莫奈', personality: '爱讲笑话的原创画家' };
  assert.equal(personaRules(custom), null);
  const prompt = buildPersonaPrompt(custom);
  assert.ok(prompt.includes(custom.personality)); assert.ok(!prompt.includes(artistPersonas.monet.core));
  assert.match(prompt, /不借用任何内置角色的背景/);
});

test('expression reaches the trusted prompt without replacing persona, scope or spoken-text rules', async () => {
  const Socket = socketMock();
  await generateNiaReply({ ...options, expression: 'firm' }, Socket);
  const prompt = Socket.instances[0].sent[1].custom_config.system_prompt;
  assert.match(prompt, /表达自己的边界/);
  assert.match(prompt, /不把不同审美当成冒犯/);
  assert.match(prompt, /不输出方向名称或表演标签/);
  assert.match(prompt, /不能知道其他人的私聊或群聊/);
  const baseline = buildPersonaPrompt(options.persona, 'private', 'calm');
  assert.equal(buildPersonaPrompt(options.persona, 'private', 'UNTRUSTED-DIRECTION'), baseline);
  assert.equal(buildPersonaPrompt(options.persona, 'private', '__proto__'), baseline);
});
test('interrupt during generation closes the session and cannot return a late reply', async () => {
  const Socket = socketMock('hang'), controller = new AbortController();
  const pending = generateNiaReply({ ...options, signal: controller.signal }, Socket);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(Socket.instances[0].closed, true);
  assert.equal(Socket.instances[0].sent.at(-1).type, 'InterruptAgent');
});
test('configuration rejection, content blocking, upstream errors and timeout fail without exposing upstream data', async () => {
  for (const scenario of ['reject', 'blocked', 'report', 'hang']) {
    await assert.rejects(generateNiaReply({ ...options, timeoutMs: 10 }, socketMock(scenario)), e => {
      assert.ok(!e.message.includes('SENSITIVE-UPSTREAM')); assert.ok(!e.message.includes(config.secretKey)); return true;
    });
  }
});
