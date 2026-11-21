import type { VoiceInputTiming } from './voiceTurn';
export type { VoiceInputTiming } from './voiceTurn';

export interface VoiceTurnTiming {
  firstSentenceMs?: number;
  firstPreparedMs?: number;
  firstAudioMs?: number;
  browserSpeechEndToAudioMs?: number;
  endpointDelayMs?: number;
}

// In-memory timings contain no transcript. Missing microphone timestamps stay
// missing: request latency must never masquerade as acoustic end-to-end latency.
export function createVoiceTiming(startedAt: number, input?: VoiceInputTiming, now = () => performance.now()) {
  const timing: VoiceTurnTiming = {};
  if (input && Number.isFinite(input.endpointDelayMs) && input.endpointDelayMs >= 0) timing.endpointDelayMs = Math.round(input.endpointDelayMs);
  return {
    mark(stage: 'firstSentenceMs' | 'firstPreparedMs' | 'firstAudioMs') {
      const at = now();
      if (timing[stage] !== undefined || !Number.isFinite(at) || at < startedAt) return;
      timing[stage] = Math.round(at - startedAt);
      if (stage === 'firstAudioMs' && input?.inputEndedAt !== undefined && Number.isFinite(input.inputEndedAt) && input.inputEndedAt <= input.submittedAt && input.inputEndedAt <= at) {
        timing.browserSpeechEndToAudioMs = Math.round(at - input.inputEndedAt);
      }
    },
    snapshot: (): VoiceTurnTiming => ({ ...timing }),
  };
}
