import { gameAsset } from './gameAssets.ts';
import { t } from './standingLanguage.ts';
import type { VoiceInputTiming } from './voiceTurn';

const sampleRate = 16000;

// Retain a short lead-in so the energy threshold cannot cut the first consonant.
export class MicUtterance {
  private frames: Float32Array[] = [];
  private voiced = 0;
  private quiet = 0;
  private duration = 0;
  started = false;

  private rate: number;
  constructor(rate: number) { this.rate = rate; }
  get trailingSilenceMs() { return this.quiet * 1000; }

  add(frame: Float32Array) {
    let energy = 0;
    for (const value of frame) energy += value * value;
    const seconds = frame.length / this.rate;
    const loud = Math.sqrt(energy / frame.length) >= .009;
    this.frames.push(frame);
    if (!this.started && !loud) {
      this.voiced = 0;
      this.frames = this.frames.slice(-Math.ceil(.25 / seconds));
      return false;
    }
    if (loud) this.voiced += seconds;
    this.started ||= this.voiced >= .064;
    if (this.started) this.duration += seconds;
    this.quiet = loud ? 0 : this.quiet + seconds;
    return this.started && (this.quiet >= .72 || this.duration >= 25);
  }

  pcm() {
    const count = this.frames.reduce((n, frame) => n + frame.length, 0);
    const samples = new Float32Array(count);
    let offset = 0;
    for (const frame of this.frames) { samples.set(frame, offset); offset += frame.length; }
    const ratio = this.rate / sampleRate;
    const bytes = new ArrayBuffer(Math.floor(count / ratio) * 2);
    const view = new DataView(bytes);
    for (let i = 0; i < view.byteLength / 2; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(count, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += samples[j];
      const value = Math.max(-1, Math.min(1, sum / (end - start)));
      view.setInt16(i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    return bytes;
  }
}

export const localMicAvailable = async (signal: AbortSignal) => {
  try {
    const response = await fetch('/api/local-asr/status', { signal, cache: 'no-store' });
    return response.ok && (await response.json()).ready === true;
  } catch { return false; }
};

export async function recordUtterance(signal: AbortSignal, callbacks: {
  listening: () => void; heard: () => void; quiet: () => void; transcribing: () => void;
}): Promise<{text: string; timing: VoiceInputTiming}> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('当前窗口无法使用麦克风，请在 Safari 或 Chrome 中打开本地游戏。', 'Open this local game in Safari or Chrome to use the microphone.'));
  let stream: MediaStream | undefined, context: AudioContext | undefined, node: AudioWorkletNode | undefined;
  const release = () => {
    if (node) { node.port.onmessage = null; node.disconnect(); node = undefined; }
    stream?.getTracks().forEach(track => track.stop()); stream = undefined;
    if (context) { void context.close().catch(() => {}); context = undefined; }
  };
  signal.addEventListener('abort', release, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
    signal.throwIfAborted();
    context = new AudioContext();
    await context.resume();
    signal.throwIfAborted();
    await context.audioWorklet.addModule(gameAsset('/worklets/room-mic.js'));
    signal.throwIfAborted();
    const ctx = context, input = stream;
    const frames = new MicUtterance(ctx.sampleRate);
    let began = performance.now(), lastLoud = began;
    const pcm = await new Promise<ArrayBuffer>((resolve, reject) => {
      const quietTimer = setTimeout(() => { if (!frames.started && !signal.aborted) callbacks.quiet(); }, 8000);
      const abort = () => { clearTimeout(quietTimer); reject(new DOMException('Stopped', 'AbortError')); };
      const unplugged = () => { clearTimeout(quietTimer); reject(new DOMException('Microphone disconnected', 'NotReadableError')); };
      signal.addEventListener('abort', abort, { once: true });
      signal.throwIfAborted();
      input.getAudioTracks()[0].addEventListener('ended', unplugged, { once:true });
      node = new AudioWorkletNode(ctx, 'room-mic', {channelCount: 1, channelCountMode:'explicit'});
      node.onprocessorerror = () => { clearTimeout(quietTimer); reject(new Error(t('录音中断，请重试。','Recording stopped. Please try again.'))); };
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const wasStarted = frames.started;
        const complete = frames.add(event.data);
        if (!wasStarted && frames.started) { clearTimeout(quietTimer); began = performance.now(); callbacks.heard(); }
        if (complete) {
          lastLoud = performance.now() - frames.trailingSilenceMs;
          signal.removeEventListener('abort', abort);
          input.getAudioTracks()[0]?.removeEventListener('ended', unplugged);
          resolve(frames.pcm());
        }
      };
      const muted = ctx.createGain(); muted.gain.value = 0;
      ctx.createMediaStreamSource(input).connect(node).connect(muted).connect(ctx.destination);
      callbacks.listening();
    });
    release();
    signal.throwIfAborted();
    callbacks.transcribing();
    const response = await fetch('/api/local-asr/transcribe', {method: 'POST', signal, headers: {'Content-Type':'application/octet-stream'}, body: pcm});
    if (!response.ok) throw new Error(t('本机转写暂不可用，请再试一次。','Local transcription is unavailable. Please try again.'));
    const result = await response.json();
    if (typeof result.text !== 'string') throw new Error(t('未收到转写结果，请重试。','No transcript arrived. Please try again.'));
    const now = performance.now();
    return {text: result.text.trim(), timing: {source:'local-asr',inputStartedAt:began,inputEndedAt:lastLoud,finalResultAt:now,submittedAt:now,endpointDelayMs:0}};
  } finally {
    signal.removeEventListener('abort', release);
    release();
  }
}
