// The desktop launcher owns the recording folder. A SHA-256 key keeps spoken
// text out of filenames, HTTP paths and logs. Store the original encoded bytes.
import { language, type Language } from './standingLanguage';
export const hasLocalVoice = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  && location.port === '4893';

export async function recordingPath(profile: unknown, text: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([profile, text.trim()]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const key = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
  return '/api/local-voice/recordings/' + key;
}

export async function readRecording(path: string, signal: AbortSignal) {
  try {
    const res = await fetch(path, { signal, cache: 'no-store' });
    if (res.status === 200 && res.headers.get('Content-Type') === 'application/octet-stream') return await res.arrayBuffer();
  } catch { /* A missing archive must not block live speech. */ }
  return null;
}

export async function storeRecording(path: string, audio: ArrayBuffer) {
  try {
    await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: audio });
  } catch { /* Read-only hosts and full disks still allow this turn to play. */ }
}

export async function synthesizeOnMac(artist: string, text: string, rate: number, signal: AbortSignal, spokenLanguage: Language = language) {
  const res = await fetch('/api/local-voice/speak', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist, text, rate, language: spokenLanguage }),
  });
  if (!res.ok || !res.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('本机语音暂不可用。');
  return { audio: await res.arrayBuffer(), engine: res.headers.get('X-Voice-Engine') ?? 'macos' };
}
