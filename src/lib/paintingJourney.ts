import { paintingFromPlayer, paintingFromReply, type Painting } from './paintings.ts';
import type { PaintingMemory } from './types';

export type PaintingJourneyPhase = 'viewing' | 'framing' | 'filing' | 'replay';
export interface PaintingJourneyState {
  painting: Painting | null;
  suppressed: boolean;
  phase: PaintingJourneyPhase;
  token: string | null;
  finishing: boolean;
}
export interface PaintingExplanation {
  speakerId: string;
  question: string;
  explanation: string;
  night: number;
}
export const initialPaintingJourney = (): PaintingJourneyState => ({ painting: null, suppressed: false, phase: 'viewing', token: null, finishing: false });
export const PAINTING_JOURNEY_TIMING = { hold: 500, frame: 1800, file: 700 } as const;
interface JourneyTimers {
  set: (callback: () => void, delay: number) => unknown;
  clear: (timer: unknown) => void;
}
const defaultTimers: JourneyTimers = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Explicit exit owns the framing animation; speech completion only caches text. */
export function createPaintingJourney(options: {
  onState?: (state: PaintingJourneyState) => void;
  onArchive: (memory: PaintingMemory) => void;
  timers?: JourneyTimers;
  now?: () => Date;
}) {
  let state = initialPaintingJourney();
  let revision = 0;
  let progress: PaintingExplanation | null = null;
  let paused = false;
  let disposed = false;
  const loaded = new Set<string>(), failed = new Set<string>();
  const timers = options.timers ?? defaultTimers, scheduled = new Set<unknown>();
  const publish = () => options.onState?.(state);
  const clear = () => { revision++; for (const timer of scheduled) timers.clear(timer); scheduled.clear(); progress = null; paused = false; };
  const current = (version: number) => !disposed && revision === version;
  const later = (callback: () => void, delay: number, version: number) => {
    const timer = timers.set(() => { scheduled.delete(timer); if (current(version)) callback(); }, delay);
    scheduled.add(timer);
  };
  const close = () => {
    clear(); state = { painting: null, suppressed: true, phase: 'viewing', token: null, finishing: false }; publish();
  };
  const capture = (token: string, explanation: PaintingExplanation) => {
    // The first reply can introduce the painting after its metadata was captured.
    if (disposed || paused || !token || token !== state.token || state.phase !== 'viewing') return;
    if (!explanation.speakerId.trim() || !explanation.question.trim() || typeof explanation.explanation !== 'string' || !Number.isSafeInteger(explanation.night) || explanation.night < 1) return;
    progress = { ...explanation };
  };
  return {
    get state() { return state; },
    begin(token: string, text: string) {
      if (disposed) return state;
      clear(); const next = paintingFromPlayer(state, text);
      state = { painting: next.painting, suppressed: next.suppressed, phase: 'viewing', token, finishing: false }; publish();
      return state;
    },
    notice(token: string, text: string) {
      if (disposed || paused || !token || token !== state.token || state.phase !== 'viewing') return;
      const next = paintingFromReply(state, text);
      if (next.painting === state.painting && next.suppressed === state.suppressed) return;
      state = { ...state, painting: next.painting, suppressed: next.suppressed }; publish();
    },
    capture,
    finish(token: string, explanation: PaintingExplanation, completed: boolean) {
      // Completion does not frame, archive, or block another spoken follow-up.
      if (completed) capture(token, explanation);
    },
    pause() {
      // Leaving the tab stops narration, but keeps the heard snapshot for exit.
      // No callback from the stopped turn can extend or reopen that snapshot.
      if (!disposed && !state.finishing) paused = true;
    },
    exit() {
      if (disposed || !state.painting || state.finishing || !['viewing', 'replay'].includes(state.phase)) return;
      const painting = state.painting;
      if (failed.has(painting.id)) { close(); return; }
      const memory: PaintingMemory | null = state.phase === 'viewing' && state.token && progress && !state.suppressed
        ? { id: state.token, paintingId: painting.id, ...progress, createdAt: (options.now?.() ?? new Date()).toISOString() }
        : null;
      // Freeze the snapshot before publishing; late audio/model events are inert.
      clear(); const version = revision;
      state = { ...state, phase: 'framing', finishing: true }; publish();
      later(() => {
        if (!loaded.has(painting.id) || failed.has(painting.id) || !memory) { close(); return; }
        state = { ...state, phase: 'filing' };
        options.onArchive(memory);
        if (!current(version)) return;
        publish();
        later(close, PAINTING_JOURNEY_TIMING.file, version);
      }, PAINTING_JOURNEY_TIMING.frame, version);
    },
    cancel() {
      if (disposed) return;
      if (state.finishing) { close(); return; }
      clear(); state = { ...state, token: null, finishing: false, phase: state.phase === 'replay' ? 'replay' : 'viewing' }; publish();
    },
    leave() { if (!disposed) close(); },
    loaded(paintingId: string) {
      if (disposed || state.painting?.id !== paintingId) return;
      failed.delete(paintingId); loaded.add(paintingId);
    },
    failed(paintingId: string) {
      if (disposed || state.painting?.id !== paintingId) return;
      failed.add(paintingId); loaded.delete(paintingId);
      if (state.finishing) { close(); return; }
      clear(); state = { ...state, finishing: false }; publish();
    },
    replay(painting: Painting) {
      if (disposed) return;
      clear(); state = { painting, suppressed: false, phase: 'replay', token: null, finishing: false }; publish();
    },
    dispose() { clear(); disposed = true; },
  };
}
