import { t, language } from '@/lib/standingLanguage';
import { hasLocalVoice } from './localVoice';
import { localMicAvailable, recordUtterance } from './roomMicrophone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceTurn, type VoiceInputTiming, type VoiceResults } from './voiceTurn';

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onspeechstart: (() => void) | null; onspeechend: (() => void) | null;
  onresult: ((event: { results: VoiceResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; abort: () => void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const detach = (recognition: Recognition) => {
  recognition.onstart = recognition.onspeechstart = recognition.onspeechend = recognition.onend = null;
  recognition.onresult = recognition.onerror = null;
};

// Recognition pauses during replies: the browser API does not expose dependable
// acoustic echo cancellation or audio frames for hands-free barge-in.
export function useRoomVoice(onText: (text: string) => void, blocked: boolean, onInputTiming?: (timing: VoiceInputTiming) => void) {
  const [enabled, setEnabled] = useState(false), [listening, setListening] = useState(false);
  const [inUtterance, setInUtterance] = useState(false);
  const [transcribing, setTranscribing] = useState(false), [lastHeard, setLastHeard] = useState('');
  const local = useRef<AbortController | null>(null), localInstalled = useRef(false);
  const [interim, setInterim] = useState(''), [error, setError] = useState('');
  const callback = useRef(onText), timingCallback = useRef(onInputTiming);
  callback.current = onText; timingCallback.current = onInputTiming;
  const intent = useRef(false), busy = useRef(blocked), current = useRef<Recognition | null>(null);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null), startRef = useRef<() => void>(() => {});
  const turn = useRef<ReturnType<typeof createVoiceTurn> | null>(null);
  busy.current = blocked;
  const stopCurrent = useCallback(() => {
    if (restart.current) clearTimeout(restart.current); restart.current = null;
    local.current?.abort(); local.current = null; setTranscribing(false);
    turn.current?.cancel(); turn.current = null;
    const recognition = current.current; current.current = null;
    if (recognition) { detach(recognition); try { recognition.abort(); } catch { /* Already ended. */ } }
    setListening(false); setInUtterance(false); setInterim('');
  }, []);
  const stop = useCallback(() => { intent.current = false; setEnabled(false); stopCurrent(); }, [stopCurrent]);
  const startNative = () => {
    if (!intent.current || busy.current || current.current || document.hidden) return;
    const browser = window as VoiceWindow, Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { intent.current = false; setEnabled(false); setError(t("这个浏览器暂不支持语音输入，可以换 Safari／Chrome 或打字聊天。", "This browser doesn’t support speech recognition. Try Safari, Chrome, or type a message.")); return; }
    turn.current ??= createVoiceTurn({ language, onDraft: setInterim, onSubmit: (text, timing) => {
      if (!intent.current || busy.current || document.hidden) return;
      stopCurrent(); setLastHeard(text); timingCallback.current?.(timing); callback.current(text);
    } });
    const buffer = turn.current, recognition = new Constructor(); let failed = false;
    const active = () => current.current === recognition && intent.current && !busy.current;
    recognition.lang = t('zh-CN', 'en-US'); recognition.continuous = true; recognition.interimResults = true;
    current.current = recognition;
    recognition.onstart = () => { if (active()) setListening(true); };
    recognition.onspeechstart = () => { if (active()) { setInUtterance(true); buffer.speechStart(); } };
    recognition.onspeechend = () => { if (active()) { setInUtterance(false); buffer.speechEnd(); } };
    recognition.onresult = event => { if (active()) buffer.results(event.results); };
    recognition.onerror = event => {
      if (!active() || ['no-speech', 'aborted'].includes(event.error)) return;
      failed = true; intent.current = false; setEnabled(false); stopCurrent();
      setError(event.error === 'not-allowed' ? t("麦克风或语音识别没有获准，请在浏览器网站设置中允许后重试。", "Allow microphone access in your browser settings and try again.")
        : event.error === 'audio-capture' ? t("没有找到麦克风，可以先打字聊天。", "No microphone found. You can type instead.")
          : event.error === 'service-not-allowed' ? t("浏览器没有允许语音识别，可以换 Safari／Chrome 或先打字。", "Speech recognition is unavailable. Try another browser or type a message.")
            : event.error === 'language-not-supported' ? t("浏览器识别服务暂不支持中文，可以先打字聊天。", "English speech recognition is unavailable. You can type instead.")
              : t("语音输入未连上浏览器识别服务，可以重试或先打字聊天。", "Speech recognition could not connect. Try again or type a message."));
    };
    recognition.onend = () => {
      if (current.current !== recognition) return;
      current.current = null; detach(recognition); setListening(false); setInUtterance(false); buffer.sessionEnded();
      if (!failed && intent.current && !busy.current) restart.current = setTimeout(() => startRef.current(), buffer.hasText ? 100 : 500);
    };
    try { recognition.start(); }
    catch { stopCurrent(); intent.current = false; setEnabled(false); setError(t("语音输入没有启动，可以重试或先打字聊天。", "The microphone didn’t start. Try again or type a message.")); }
  };
  const start = async () => {
    if (!intent.current || busy.current || current.current || local.current || document.hidden) return;
    if (!hasLocalVoice()) { startNative(); return; }
    const controller = new AbortController();
    local.current = controller;
    const active = () => local.current === controller && intent.current && !busy.current && !document.hidden;
    try {
      const ready = localInstalled.current || await localMicAvailable(controller.signal);
      if (!active()) return;
      if (!ready) { local.current = null; startNative(); return; }
      localInstalled.current = true;
      const result = await recordUtterance(controller.signal, {
        listening: () => setListening(true),
        quiet: () => setError(t('还没听到声音，你可以直接说话，或检查麦克风输入。', 'No speech yet. Try speaking, or check your microphone input.')),
        heard: () => { setInUtterance(true); setLastHeard(''); setError(''); },
        transcribing: () => { setListening(false); setTranscribing(true); },
      });
      if (!active()) return;
      stopCurrent();
      if (result.text) {
        setLastHeard(result.text); timingCallback.current?.(result.timing); callback.current(result.text);
      } else {
        setError(t('没听清，请再说一次。', 'I didn’t catch that. Please say it again.'));
      }
      // Some commands (or an empty transcript) do not start an artist reply.
      // Re-arm after React can apply any new blocked state.
      restart.current = setTimeout(() => startRef.current(), 240);
    } catch (err) {
      if (!active()) return;
      stop();
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(t('请允许此页面使用麦克风，并在 Mac「系统设置 → 隐私与安全性 → 麦克风」中允许当前应用。', 'Allow microphone access for this page and its app in Mac System Settings → Privacy & Security → Microphone.'));
      } else if (name === 'NotFoundError' || name === 'NotReadableError') {
        setError(t('没有可用的麦克风，请在 Mac「声音 → 输入」中检查设备。', 'Check the input device in Mac System Settings → Sound → Input.'));
      } else {
        setError(err instanceof Error ? err.message : t('麦克风未能启动，请重试。','The microphone could not start. Please try again.'));
      }
    }
  };
  startRef.current = () => { void start(); };
  const resume = () => { setError(''); intent.current = true; setEnabled(true); startRef.current(); };
  const toggle = () => { if (intent.current) stop(); else resume(); };
  useEffect(() => {
    stopCurrent();
    if (!blocked && intent.current) restart.current = setTimeout(() => startRef.current(), 180);
    return () => { if (restart.current) clearTimeout(restart.current); };
  }, [blocked, language, stopCurrent]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { intent.current = false; stopCurrent(); document.removeEventListener('visibilitychange', visibility); };
  }, [stop, stopCurrent]);
  return { enabled, listening, inUtterance, interim, transcribing, lastHeard, error, toggle, resume, stop };
}
