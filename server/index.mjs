import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { generateNiaReply, niaConfig } from './nia.mjs';
import { dialogueInput } from './dialogueInput.mjs';
const configFile = fileURLToPath(new URL('../.env.server.local', import.meta.url));
if (existsSync(configFile)) process.loadEnvFile(configFile);
const config = niaConfig();
const port = Number(process.env.NIA_LOCAL_PORT || 4894);
let running = 0;
function validOrigin(origin) {
  if (!origin) return true;
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname); } catch { return false; }
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, data) => { if (!res.destroyed && !res.writableEnded) { res.writeHead(status); res.end(JSON.stringify(data)); } };
  if (!validOrigin(req.headers.origin)) { send(403, { error: '只允许本机游戏访问。' }); return; }
  if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/api/dialogue/config') { send(200, { configured: !!(config.accessKey && config.secretKey && config.model), model: config.model }); return; }
  if (req.method !== 'POST' || req.url !== '/api/dialogue') { send(404, { error: 'Not found' }); return; }
  if (!config.accessKey || !config.secretKey || !config.model) { send(503, { error: 'NIA 服务端尚未配置完整。' }); return; }
  if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: '需要 JSON 请求。' }); return; }
  if (running >= 3) { send(429, { error: '正在处理其他对话，请稍后重试。' }); return; }
  const controller = new AbortController(); req.on('aborted', () => controller.abort()); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  let counted = false;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 64000) { send(413, { error: '对话资料过长。' }); return; } chunks.push(chunk); }
    let payload; try { payload = dialogueInput(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { send(400, { error: '对话内容格式不正确。' }); return; }
    if (controller.signal.aborted) return;
    if (running >= 3) { send(429, { error: '正在处理其他对话，请稍后重试。' }); return; }
    running++; counted = true;
    const streaming = req.headers.accept?.includes('application/x-ndjson');
    const write = data => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(data) + '\n'); };
    if (streaming) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
    }
    const text = await generateNiaReply({ ...payload, config, signal: controller.signal,
      onText: streaming ? text => write({ type: 'text', text }) : undefined });
    if (streaming) { write({ type: 'done', text, source: 'nia' }); res.end(); }
    else send(200, { ok: true, text, source: 'nia' });
  } catch (error) {
    if (error?.name !== 'AbortError') {
      const detail = error instanceof Error ? error.message : 'NIA 暂时没有回复。';
      if (res.headersSent) { if (!res.destroyed && !res.writableEnded) res.end(JSON.stringify({ type: 'error', error: detail }) + '\n'); }
      else send(502, { error: detail });
    }
  } finally { if (counted) running--; }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `本机对话端口 ${port} 已在使用。` : '本机对话服务未能启动。'); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`NIA 本机对话服务：http://127.0.0.1:${port}（${config.model || '未配置模型'}）`));
