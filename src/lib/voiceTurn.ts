export interface VoiceInputTiming {
  source: 'browser-asr' | 'local-asr';
  inputStartedAt: number;
  // Browser event estimates, not a measurement of microphone audio frames.
  inputEndedAt?: number;
  finalResultAt: number;
  submittedAt: number;
  endpointDelayMs: number;
}
export interface VoiceResult { isFinal: boolean; 0: { transcript: string } }
export interface VoiceResults { length: number; [index: number]: VoiceResult }

// Browser final results can be several pieces of a single user turn. Keep the
// full result snapshot (interim entries are revisions, not append-only tokens).
// A small grace period permits a continuation or self-correction before send.
export function createVoiceTurn(options: {
  onDraft: (text: string) => void;
  language?: 'zh' | 'en';
  onSubmit: (text: string, timing: VoiceInputTiming) => void;
  now?: () => number;
  settleMs?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? (() => performance.now());
  const join = (left: string, right: string) => options.language === 'en' && /[\p{L}\p{N}.!?]$/u.test(left) && /^[\p{L}\p{N}]/u.test(right)
    ? left + ' ' + right : left + right;
  const schedule = options.schedule ?? setTimeout;
  const unschedule = options.unschedule ?? clearTimeout;
  const settleMs = options.settleMs ?? 360;
  let prior = '', final = '', partial = '', startedAt: number | undefined;
  let endedAt: number | undefined, finalAt = 0, deadline = 0, closed = false;
  let awaitingSpeechResult = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) unschedule(timer); timer = undefined; };
  const submit = () => {
    clear();
    if (closed) return;
    const text = join(prior, final).trim();
    if (!text) return;
    closed = true;
    const submittedAt = now();
    options.onDraft('');
    options.onSubmit(text.slice(0, 400), {
      source: 'browser-asr', inputStartedAt: startedAt ?? finalAt,
      ...(endedAt === undefined ? {} : { inputEndedAt: endedAt }),
      finalResultAt: finalAt, submittedAt,
      endpointDelayMs: Math.max(0, submittedAt - finalAt),
    });
  };
  const wait = () => {
    clear();
    if (closed || awaitingSpeechResult || partial || !(prior + final).trim()) return;
    timer = schedule(submit, Math.max(0, deadline - now()));
  };
  return {
    speechStart(at = now()) {
      if (closed) return;
      startedAt ??= at; endedAt = undefined; awaitingSpeechResult = true; clear();
    },
    speechEnd(at = now()) {
      if (closed) return;
      endedAt = at;
      // A resumed phrase can precede its transcript. An old final snapshot
      // must not submit while that phrase is still being spoken.
      if (awaitingSpeechResult) { awaitingSpeechResult = false; deadline = at + settleMs; }
      wait();
    },
    results(results: VoiceResults, at = now()) {
      if (closed) return;
      startedAt ??= at;
      let nextFinal = '', nextPartial = '';
      for (let index = 0; index < results.length; index++) {
        const item = results[index];
        if (item.isFinal) nextFinal = join(nextFinal, item[0].transcript);
        else nextPartial = join(nextPartial, item[0].transcript);
      }
      if (nextFinal !== final || nextPartial) awaitingSpeechResult = false;
      if (nextFinal !== final) { finalAt = at; deadline = at + settleMs; }
      else if (partial && !nextPartial) deadline = at + settleMs;
      final = nextFinal; partial = nextPartial;
      options.onDraft(join(join(prior, final), partial).trim().slice(0, 400));
      wait();
    },
    sessionEnded() {
      if (closed) return;
      // Give an interrupted continuation time to resume after the browser's
      // automatic restart; never treat an unconfirmed interim as final.
      if (awaitingSpeechResult || partial) deadline = now() + settleMs;
      awaitingSpeechResult = false;
      prior = join(prior, final); final = ''; partial = '';
      options.onDraft(prior.trim().slice(0, 400));
      // Retain the remaining grace period across a browser's auto-end/restart.
      wait();
    },
    cancel() { closed = true; clear(); options.onDraft(''); },
    get hasText() { return !!(prior + final + partial).trim(); },
  };
}
