// Prepare up to two sentences ahead, but keep one interruptible audio channel.
export function createSpeechQueue<T>(options: {
  signal: AbortSignal;
  prepare: (text: string, signal: AbortSignal) => Promise<T>;
  play: (audio: T, text: string, signal: AbortSignal) => Promise<void>;
  waiting?: () => void;
}) {
  const { signal } = options;
  type Job = { text: string; ready: Promise<{ value: T } | { error: unknown }> };
  const jobs: Job[] = [];
  let ended = false, active = 0, wake: (() => void) | undefined;
  const slots: (() => void)[] = [];
  const cancelled = new Promise<null>(resolve => {
    if (signal.aborted) resolve(null);
    else signal.addEventListener('abort', () => { resolve(null); wake?.(); }, { once: true });
  });
  async function prepare(text: string) {
    // A newly pushed job can claim a released slot before a queued job resumes
    // from its promise. Recheck after every wake-up so both cannot claim it.
    while (active >= 2 && !signal.aborted) await Promise.race([new Promise<void>(resolve => slots.push(resolve)), cancelled]);
    if (signal.aborted) throw new DOMException('已停止', 'AbortError');
    active++;
    try { return await options.prepare(text, signal); }
    finally { active--; slots.shift()?.(); }
  }
  const done = (async () => {
    while (!signal.aborted) {
      const job = jobs.shift();
      if (!job) {
        if (ended) break;
        await Promise.race([new Promise<void>(resolve => { wake = resolve; }), cancelled]);
        wake = undefined; continue;
      }
      options.waiting?.();
      const result = await Promise.race([job.ready, cancelled]);
      if (!result || signal.aborted) break;
      if ('error' in result) throw result.error;
      await Promise.race([options.play(result.value, job.text, signal), cancelled]);
    }
  })();
  return {
    push(text: string) {
      if (ended || signal.aborted || !text.trim()) return;
      jobs.push({ text: text.trim(), ready: prepare(text.trim()).then(value => ({ value }), error => ({ error })) });
      wake?.();
    },
    end() { ended = true; wake?.(); },
    done,
  };
}

// Start promptly, then preserve longer complete thoughts instead of repeatedly
// restarting the voice in the middle of a sentence. Never synthesize tokens.
export function speechParts(text: string, final = false, maxChars = 48, language: 'zh' | 'en' = 'zh'): { parts: string[]; rest: string } {
  if (language === 'en') {
    const parts: string[] = [];
    let rest = text;
    const clauseLimit = Math.max(128, maxChars * 2);
    while (rest.trim()) {
      let end = 0;
      for (const match of rest.matchAll(/[.!?]+["”']?(?=\s|$)/g)) {
        const offset = match.index! + match[0].length;
        if (!final && offset === rest.length) break; // May still be a decimal or abbreviation.
        if (match[0] === '.') {
          const before = rest.slice(0, match.index);
          if (/\b(?:Mr|Mrs|Ms|Dr|St|Prof|e\.g|i\.e)$/i.test(before)) continue;
          if (/\b[A-HJ-Z]$/.test(before) && /^\s+(?:[A-Z]|$)/.test(rest.slice(offset))) continue;
        }
        end = offset;
        break;
      }
      if (!end && rest.length > clauseLimit) {
        const clause = /[,;:](?=\s)|\s[—–](?=\s)/g;
        const breakAt = [...rest.slice(0, clauseLimit).matchAll(clause)].filter(m => m.index! >= 35).at(-1);
        if (breakAt) end = breakAt.index! + breakAt[0].length;
        else if (rest.length > 260) end = Math.max(0, rest.lastIndexOf(' ', 240));
      }
      if (!end && final) end = rest.length;
      if (!end) break;
      parts.push(rest.slice(0, end)); rest = rest.slice(end);
    }
    return { parts, rest };
  }
  const limit = Math.max(48, Math.min(96, maxChars));
  const parts: string[] = [];
  let rest = text;
  while (rest.length) {
    const boundary = /[。！？!?；;\n]/g;
    let cut = 0, match: RegExpExecArray | null;
    while ((match = boundary.exec(rest))) {
      const end = match.index + match[0].length;
      if (end > limit) break;
      if (end >= 12 || final && end === rest.length) { cut = end; break; }
    }
    if (!cut && rest.length >= limit) {
      const window = rest.slice(12, limit);
      const comma = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf('、'));
      cut = comma >= 0 ? 13 + comma : limit;
    }
    if (!cut) { if (final) { parts.push(rest); rest = ''; } break; }
    // Keep closing quotes attached when they are already available.
    while (/[”’」』）)]/.test(rest[cut] ?? '') && cut < rest.length) cut++;
    parts.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  return { parts, rest };
}
