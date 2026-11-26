import { useEffect, useRef, useState } from 'react';

const sceneUrl = new URL(import.meta.env.VITE_TRAIL_SCENE_URL || 'http://127.0.0.1:43170/?v=wayfinding-final', window.location.href);
const chinese = new URLSearchParams(window.location.search).get('lang') === 'zh';
sceneUrl.searchParams.set('lang', chinese ? 'zh' : 'en');
const stallTimeoutMs = 20_000;

type SceneState =
  | { phase: 'loading'; progress: number }
  | { phase: 'ready' | 'error' };

export function TrailScene() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SceneState>({ phase: 'loading', progress: 0 });
  const ready = state.phase === 'ready';

  useEffect(() => {
    let lastProgress = 0;
    let settled = false;
    let timeout: number | undefined;

    function finish(phase: 'ready' | 'error') {
      settled = true;
      window.clearTimeout(timeout);
      setState({ phase });
    }

    function waitForProgress() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => finish('error'), stallTimeoutMs);
    }

    waitForProgress();

    function receiveState(event: MessageEvent) {
      if (settled || event.origin !== sceneUrl.origin || event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.type !== 'trail:state') return;
      if (message.phase === 'ready' || message.phase === 'error') {
        finish(message.phase);
      } else if (message.phase === 'loading' && Number.isFinite(message.progress)) {
        const progress = Math.min(1, Math.max(0, message.progress));
        if (progress <= lastProgress) return;
        lastProgress = progress;
        setState({ phase: 'loading', progress });
        waitForProgress();
      }
    }

    window.addEventListener('message', receiveState);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receiveState);
    };
  }, [attempt]);

  useEffect(() => {
    if (!ready) return;
    frame.current?.focus({ preventScroll: true });
    frame.current?.contentWindow?.postMessage({ type: 'trail:focus' }, sceneUrl.origin);
  }, [ready]);

  function retry() {
    setState({ phase: 'loading', progress: 0 });
    setAttempt((count) => count + 1);
  }

  return (
    <section className="trail-scene" data-ready={ready || undefined} aria-label="Cloudridge Trail">
      <div className="trail-veil" aria-hidden={ready || undefined}>
        {state.phase === 'loading' && (
          <div className="trail-status">
            <p role="status">{chinese ? '正在载入步道…' : 'Loading the trail'}</p>
            <progress aria-label={chinese ? '步道载入进度' : 'Trail loading progress'} max={1} value={state.progress} />
          </div>
        )}
        {state.phase === 'error' && (
          <div className="trail-status">
            <p role="alert">{chinese ? '步道未能载入，请重试。' : 'The trail couldn’t be loaded. Try again.'}</p>
            <div className="trail-recovery">
              <button type="button" className="film-button start-button" onClick={retry}>{chinese ? '重试载入' : 'Try again'}</button>
              <a href={sceneUrl.href} target="_blank" rel="noopener">{chinese ? '在新标签页打开步道' : 'Open the trail in a new tab'}</a>
            </div>
          </div>
        )}
      </div>

      {state.phase !== 'error' && <iframe
        key={attempt}
        ref={frame}
        className="trail-frame"
        title="Cloudridge Trail"
        src={sceneUrl.href}
        allow="autoplay; fullscreen"
        tabIndex={ready ? 0 : -1}
        aria-hidden={!ready}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'trail:connect' }, sceneUrl.origin)}
      />}
    </section>
  );
}
