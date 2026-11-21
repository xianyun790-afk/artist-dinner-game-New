import type { Artist } from './types';
import { speechParts } from './speechQueue.ts';
import type { Language } from './standingLanguage';
import { isArtistExpression, type ArtistExpression } from './artistExpression.ts';
import { findNamedPainting, paintingCatalog } from './paintings.ts';
export interface DialogueLine { who: 'player' | 'artist'; name?: string; text: string }
export type DialogueMode = 'private' | 'group' | 'duo';
export type DialogueContext = { scene: 'table' } | { scene: 'painting'; paintingId?: string };
const paintingIds = new Set(paintingCatalog.map(p => p.id));
export function dialogueContext(context: DialogueContext = { scene: 'table' }): DialogueContext {
  if (!context || typeof context !== 'object' || !['table', 'painting'].includes(context.scene)) throw new Error('当前场景不正确。');
  const paintingId = 'paintingId' in context ? context.paintingId : undefined;
  if (paintingId !== undefined && (context.scene !== 'painting' || typeof paintingId !== 'string' || !paintingIds.has(paintingId))) throw new Error('当前画作不正确。');
  return context.scene === 'table' ? { scene: 'table' } : { scene: 'painting', ...(paintingId ? { paintingId } : {}) };
}
export function dialogueBody(artist: Artist, text: string, history: DialogueLine[], mode: DialogueMode, expression: ArtistExpression = 'calm', context: DialogueContext = { scene: 'table' }, language: Language = 'zh') {
  if (!text.trim() || text.length > 400) throw new Error('请输入 1–400 字。');
  if (!isArtistExpression(expression)) throw new Error('人物表达状态不正确。');
  const { id, name, fullName, identityType, personality, bio, medium } = artist;
  // Discussing a work without displaying it still needs its facts. Never send
  // artwork references from a previous turn as this turn's subject.
  const workId = findNamedPainting(text)?.id;
  return { persona: { id, name, fullName, identityType, personality, bio, medium }, text: text.trim(), mode, expression, context: dialogueContext(context),
    ...(workId ? { workId } : {}), ...(language === 'en' ? { language } : {}),
    history: history.slice(-12).map(m => ({ who: m.who, ...(m.name ? { name: m.name.slice(0, 80) } : {}), text: m.text.slice(0, 2000) })),
  };
}
export function dialogueRoot(base: string) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('对话服务地址不正确。');
  return url.href.replace(/\/+$/, '');
}
export async function requestDialogue(base: string, body: ReturnType<typeof dialogueBody>, signal: AbortSignal, fetcher: typeof fetch = fetch, onSentence?: (text: string) => void): Promise<string> {
  const response = await fetcher(`${dialogueRoot(base)}/api/dialogue`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(onSentence ? { Accept: 'application/x-ndjson' } : {}) }, credentials: 'omit', signal, body: JSON.stringify(body) });
  if (response.ok && onSentence && response.headers.get('Content-Type')?.includes('application/x-ndjson') && response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '', emitted = '', final = '';
    const deliver = (text: string, done = false) => {
      if (signal.aborted) throw new DOMException('已打断', 'AbortError');
      if (text.length > 1000 || !text.startsWith(emitted)) throw new Error('NIA 对话流内容不一致。');
      const { parts } = speechParts(text.slice(emitted.length), done, emitted ? 96 : 48, body.language);
      for (const part of parts) { emitted += part; if (part.trim()) onSentence(body.language === 'en' ? part : part.trim()); }
    };
    const packet = (line: string) => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      if (data.type === 'error') throw new Error('NIA 对话流中断。');
      if (!['text', 'done'].includes(data.type) || typeof data.text !== 'string' || final) throw new Error('NIA 对话流格式不正确。');
      deliver(data.text, data.type === 'done');
      if (data.type === 'done') final = data.text.trim();
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted) throw new DOMException('已打断', 'AbortError');
        pending += decoder.decode(value, { stream: !done });
        if (pending.length > 16000) throw new Error('NIA 对话流过长。');
        const lines = pending.split('\n'); pending = lines.pop()!;
        lines.forEach(packet);
        if (final) return final;
        if (done) { if (pending.trim()) packet(pending); break; }
      }
      if (!final) throw new Error('NIA 对话流提前结束。');
      return final;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  const data = await response.json();
  if (!response.ok || data.ok !== true || typeof data.text !== 'string' || !data.text.trim()) throw new Error('NIA 暂时没有返回对白。');
  const text = data.text.trim().slice(0, 1000);
  onSentence?.(text); return text;
}
