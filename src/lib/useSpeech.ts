import { gameAsset } from '@/lib/gameAssets';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
import { createSpeechQueue } from './speechQueue';
import { language, t, type Language } from './standingLanguage';
import { hasLocalVoice, readRecording, recordingPath, storeRecording, synthesizeOnMac } from './localVoice';
import { artistSpeechStyle, englishSpeechDelivery, selectDeviceVoice, defaultServiceVoice, connectVoiceCatalog, createVoiceSynthesizer, validateServiceVoice, voicesForModel, type VoiceCatalog } from './voiceService';
import { expressionDirection, type ArtistExpression } from './artistExpression';
import { createVoiceTiming, type VoiceInputTiming, type VoiceTurnTiming } from './voiceTiming';
const serviceBase = (import.meta.env.VITE_VOICE_SERVICE_URL || '').trim();
export const voiceEngineFor = (a: Artist) => a.voiceEngine ?? (a.voiceURI || !serviceBase ? 'device' : 'service');
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [firstAudioMs, setFirstAudioMs] = useState<number | null>(null);
  const [timing, setTiming] = useState<VoiceTurnTiming>({});
  const [currentExpression, setCurrentExpression] = useState<ArtistExpression>('calm');
  const [timingScope, setTimingScope] = useState<'turn' | 'group-followup'>('turn');
  const [caption, setCaption] = useState<{ artistId: string; text: string } | null>(null);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [connection, setConnection] = useState<'off' | 'connecting' | 'ready' | 'error'>(serviceBase ? 'connecting' : 'off');
  const [connectionError, setConnectionError] = useState('');
  const connectionTask = useRef<Promise<VoiceCatalog | null> | null>(null);
  const seq = useRef(0), utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const request = useRef<AbortController | null>(null), catalogRequest = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null);
  const synthesisCache = useRef(createVoiceSynthesizer());
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const release = useCallback(() => {
    seq.current++; request.current?.abort(); request.current = null;
    if (source.current) { source.current.onended = null; try { source.current.stop(); } catch { /* Already ended. */ } source.current.disconnect(); source.current = null; }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; utterance.current.onstart = null; }
    if (available) window.speechSynthesis.cancel();
    utterance.current = null;
  }, [available]);
  const stop = useCallback(() => { release(); setSpeaking(false); setLoading(false); setStatus(''); setCaption(null); }, [release]);
  // Called synchronously from a click/submit, before the asynchronous TTS request.
  const unlock = useCallback(() => {
    try { context.current ??= new AudioContext(); if (context.current.state === 'suspended') void context.current.resume().catch(() => {}); } catch { /* Device speech remains available. */ }
  }, []);
  // Decoding is allowed before playback is unlocked by the first interaction.
  const prepareRecording = useCallback(async (url: string, signal?: AbortSignal) => {
    const ctx = context.current ??= new AudioContext();
    const response = await fetch(gameAsset(url), { signal });
    if (!response.ok) throw new Error('录音未加载');
    return ctx.decodeAudioData(await response.arrayBuffer());
  }, []);
  const refresh = useCallback((): Promise<VoiceCatalog | null> => {
    if (!serviceBase) return Promise.resolve(null);
    if (connectionTask.current) return connectionTask.current;
    synthesisCache.current.clear();
    const controller = new AbortController(); catalogRequest.current = controller;
    setConnection('connecting'); setConnectionError('');
    const task = (async () => {
      try {
        const result = await connectVoiceCatalog(serviceBase, controller.signal);
        if (catalogRequest.current !== controller) return null;
        setCatalog(result); setConnection('ready'); setError('');
        return result;
      } catch (error) {
        if (catalogRequest.current !== controller) return null;
        setConnection('error');
        const detail = error instanceof Error && error.message.includes('超时') ? '连接超时，已自动重试一次。' : '暂时无法访问音色服务，已自动重试一次。';
        setConnectionError(`${detail}可以重新连接；请确认当前设备能访问服务所在网络。`);
        return null;
      } finally { if (catalogRequest.current === controller) connectionTask.current = null; }
    })();
    connectionTask.current = task;
    return task;
  }, []);
  useEffect(() => { void refresh(); return () => { catalogRequest.current?.abort(); catalogRequest.current = null; connectionTask.current = null; }; }, [refresh]);
  useEffect(() => {
    const retry = () => { if (!document.hidden && connection === 'error') void refresh(); };
    window.addEventListener('online', retry); document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [connection, refresh]);
  useEffect(() => {
    if (!available) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update(); window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, [available]);
  useEffect(() => () => { release(); synthesisCache.current.clear(); void context.current?.close(); context.current = null; }, [release]);
  const voiceFor = useCallback((a: Artist) => a.serviceVoice ?? (catalog ? defaultServiceVoice(a.id, catalog, language) : undefined), [catalog]);
  const startStream = useCallback((a: Artist, signal?: AbortSignal, onCaption?: (text: string) => void, options?: { recording?: AudioBuffer; recordingUrl?: string | ((sentence: string) => string | undefined); expression?: ArtistExpression; submittedAt?: number; inputTiming?: VoiceInputTiming; timingScope?: 'turn' | 'group-followup'; language?: Language }) => {
    stop(); setError(''); setFirstAudioMs(null); setTiming({}); unlock(); const turn = seq.current;
    const clock = createVoiceTiming(options?.submittedAt ?? performance.now(), options?.inputTiming);
    const expression = options?.expression ?? 'calm';
    const spokenLanguage = options?.language ?? language;
    const english = spokenLanguage === 'en';
    setCurrentExpression(expression);
    setTimingScope(options?.timingScope ?? 'turn');
    const { style, rate, pitch } = english ? englishSpeechDelivery(a.id, a.rate, expression, a.pitch) : {
      pitch: a.pitch,
      style: artistSpeechStyle(a.id) + expressionDirection(expression),
      rate: a.rate * (expression === 'firm' ? .97 : expression === 'warm' ? 1.02 : 1),
    };
    const controller = new AbortController(); request.current = controller;
    const cancel = () => { if (turn === seq.current) stop(); else controller.abort(); };
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', cancel, { once: true });
    let firstAudio = true, playbackFailed = false;
    const markAudio = () => { if (firstAudio) { firstAudio = false; clock.mark('firstAudioMs'); const snapshot = clock.snapshot(); setFirstAudioMs(snapshot.firstAudioMs ?? null); setTiming(snapshot); } };
    const active = () => turn === seq.current && !controller.signal.aborted;
    const local = hasLocalVoice();
    const useDevice = a.voiceEngine === 'device' || !!(a.voiceURI && a.voiceEngine !== 'service');
    const signalForTurn = controller.signal;
    // The first user gesture starts resume(), but a bundled clip can decode
    // before the audio device is ready. Also release a blocked turn on stop.
    const waitForOutput = (ctx: AudioContext) => new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timeout);
        signalForTurn.removeEventListener('abort', done);
        resolve();
      };
      const timeout = setTimeout(done, 2000);
      signalForTurn.addEventListener('abort', done, { once: true });
      void ctx.resume().then(done, done);
    });
    const allowService = !useDevice && !!serviceBase && !options?.recording && !options?.recordingUrl;
    const metadata = allowService ? (connection === 'ready' && catalog ? Promise.resolve(catalog) : refresh()) : Promise.resolve(null);
    // A disconnected LAN can take seconds to time out. Let the local engine
    // start this turn while discovery continues for the next one.
    const liveMetadata = local && allowService ? new Promise<VoiceCatalog | null>(resolve => {
      const timeout = setTimeout(() => resolve(null), 1400);
      void metadata.then(result => { clearTimeout(timeout); resolve(result); });
    }) : metadata;
    let label = '', serviceFailed = false, segmentIndex = 0;
    type Prepared = { buffer: AudioBuffer; label: string };
    const queue = createSpeechQueue<Prepared | null>({
      signal: signalForTurn,
      waiting: () => { if (active()) { setSpeaking(false); setLoading(true); setStatus('正在准备声音…'); } },
      prepare: async text => {
        if (options?.recording) return { buffer: options.recording, label: a.name };
        const ctx = context.current;
        if (!ctx) return null;
        const recordingUrl = typeof options?.recordingUrl === 'function' ? options.recordingUrl(text) : options?.recordingUrl;
        if (recordingUrl) {
          try {
            const buffer = await prepareRecording(recordingUrl, signalForTurn);
            return { buffer, label: a.name };
          } catch { /* Missing bundled clip can still use local synthesis. */ }
        }
        if (useDevice || (!serviceBase && !local)) return null;
        const index = segmentIndex++;
        const decode = async (data: ArrayBuffer, source: string) => {
          const buffer = await ctx.decodeAudioData(data);
          if (active() && index === 0) { clock.mark('firstPreparedMs'); setTiming(clock.snapshot()); }
          return { buffer, label: source };
        };
        const profile = [serviceBase, a.id, a.serviceVoice ?? 'recommended', rate, pitch, style, ...(english ? ['en'] : [])];
        const path = local ? await recordingPath(profile, text) : null;
        if (path) {
          const stored = await readRecording(path, signalForTurn);
          if (stored && active()) {
            try { return await decode(stored, '本机保存的角色原声'); } catch { /* Repair damaged audio below. */ }
          }
        }
        const liveCatalog = await liveMetadata;
        if (!active()) return null;
        const choice = a.serviceVoice ?? (liveCatalog ? defaultServiceVoice(a.id, liveCatalog, spokenLanguage) : undefined);
        if (!serviceFailed && liveCatalog && choice && validateServiceVoice(choice, liveCatalog)) {
          const provider = liveCatalog.providers.find(p => p.id === choice.provider)!;
          const voiceName = voicesForModel(provider, choice.model).find(v => v.id === choice.voice)?.name || choice.voice;
          const synthesis = new AbortController();
          const abort = () => synthesis.abort(); signalForTurn.addEventListener('abort', abort, { once: true });
          const timer = setTimeout(abort, 20000);
          try {
            const audio = await synthesisCache.current.synthesize(serviceBase, choice, text, rate, pitch, synthesis.signal, fetch, style);
            if (!active()) return null;
            const prepared = await decode(path ? audio.slice(0) : audio, voiceName);
            if (path && active()) await storeRecording(path, audio);
            return prepared;
          } catch { serviceFailed = true; }
          finally { clearTimeout(timer); signalForTurn.removeEventListener('abort', abort); }
        }
        if (!active()) return null;
        if (local) {
          try {
            const offlinePath = await recordingPath(['qwen-icl-1', ...profile], text);
            const previous = await readRecording(offlinePath, signalForTurn);
            if (previous && active()) {
              try { return await decode(previous, '本机角色音色'); } catch { /* Generate this line again. */ }
            }
            if (!active()) return null;
            const clip = await synthesizeOnMac(a.id, text, rate, signalForTurn, spokenLanguage);
            if (clip.engine !== 'qwen') return await decode(clip.audio, 'Mac 离线音色');
            const prepared = await decode(clip.audio.slice(0), '本机角色音色');
            if (active()) await storeRecording(offlinePath, clip.audio);
            return prepared;
          } catch { /* The browser voice remains available if the local engine is unavailable. */ }
        }
        if (active()) setError(t("角色音色暂不可用，本次尝试设备语音。", "Trying a device voice for this reply."));
        serviceFailed = true;
        return null;
      },
      play: async (prepared, text) => {
        const output = context.current;
        if (active() && prepared?.buffer && output && output.state !== 'running') await waitForOutput(output);
        return new Promise<void>(resolve => {
          if (!active()) { resolve(); return; }
          const buffer = prepared?.buffer;
          label = prepared?.label ?? '设备音色';
          // Follow the single playback queue, rather than text arriving ahead
          // from the model. Keep the last clause readable after speech finishes.
          let shown = false;
          const showCaption = () => { if (active()) { setCaption({ artistId: a.id, text }); if (!shown) { shown = true; onCaption?.(text); } } };
          const finished = () => { controller.signal.removeEventListener('abort', finished); resolve(); };
          controller.signal.addEventListener('abort', finished, { once: true });
          if (buffer) {
            const ctx = context.current;
            if (!ctx || ctx.state !== 'running') {
              playbackFailed = true; showCaption(); setLoading(false); setError(t("请点击试听或说话按钮启用声音；本次字幕已保留。", "Tap a voice or speaking button to enable audio.")); finished(); return;
            }
            const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination); source.current = node;
            node.onended = () => { node.disconnect(); if (source.current === node) source.current = null; finished(); };
            try { node.start(); showCaption(); markAudio(); setLoading(false); setSpeaking(true); setStatus(`正在朗读 · ${label}`); }
            catch { playbackFailed = true; showCaption(); node.disconnect(); source.current = null; finished(); }
            return;
          }
          if (!available) { playbackFailed = true; showCaption(); setError(t("这段声音暂时不可用，可继续看字幕。", "Audio is unavailable. You can still read the reply.")); finished(); return; }
          const u = new SpeechSynthesisUtterance(text); u.lang = english ? 'en-US' : 'zh-CN'; u.rate = rate; u.pitch = pitch;
          const localVoices = window.speechSynthesis.getVoices();
          const selected = selectDeviceVoice(localVoices.length ? localVoices : voices, a.id, a.voiceURI, spokenLanguage);
          if (!selected && a.id === 'dali') {
            playbackFailed = true; showCaption(); setError(t("未找到适合达利的中文男声，本次保留字幕。", "No suitable English voice is available for Dalí. His reply is still on screen.")); finished(); return;
          }
          if (selected) u.voice = selected;
          u.onstart = () => { if (active()) { showCaption(); markAudio(); setLoading(false); setSpeaking(true); setStatus(serviceFailed ? '正在使用设备语音回退' : '正在用设备音色朗读'); } };
          u.onend = finished;
          u.onerror = e => { playbackFailed = true; if (active() && !['interrupted', 'canceled'].includes(e.error)) { showCaption(); setError(t("设备声音暂时不可用，字幕已保留。", "Device audio is unavailable. The reply is still on screen.")); } finished(); };
          utterance.current = u;
          try { window.speechSynthesis.speak(u); } catch { playbackFailed = true; showCaption(); setError(t("声音暂时不可用，可继续看字幕。", "Audio is unavailable. You can still read the reply.")); finished(); }
        });
      },
    });
    // A stopped queue resolves even when an old fetch/decode finishes late.
    const done = queue.done.then(() => active() && !playbackFailed && !firstAudio).catch(() => { if (active()) setError(t("声音暂时不可用，可继续看字幕。", "Audio is unavailable. You can still read the reply.")); return false; }).finally(() => {
      signal?.removeEventListener('abort', cancel);
      if (turn === seq.current) { setLoading(false); setSpeaking(false); setStatus(`已播完 · ${label || '设备音色'}`); if (request.current === controller) request.current = null; }
    });
    return { push: (text: string) => { if (active() && text.trim()) { clock.mark('firstSentenceMs'); setTiming(clock.snapshot()); queue.push(text); } }, end: queue.end, done };
  }, [available, voices, stop, unlock, catalog, connection, refresh, prepareRecording]);
  const play = useCallback((text: string, a: Artist) => {
    const stream = startStream(a); stream.push(text); stream.end(); return stream.done;
  }, [startStream]);
  return { prepareRecording, voices, speaking, loading, error, status, firstAudioMs, timing, timingScope, expression: currentExpression, caption, play, startStream, stop, unlock, available, catalog, connection, connectionError, refresh, voiceFor, serviceConfigured: !!serviceBase };
}
export type SpeechController = ReturnType<typeof useSpeech>;
