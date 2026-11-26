import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TrailScene } from '@/components/TrailScene';
import { ConversationReturn } from '@/components/ConversationReturn';

type Phase = 'loading' | 'playing' | 'ended' | 'error';
type Framing = 'wide' | 'square' | 'portrait';

const mediaRoot = `${import.meta.env.BASE_URL}media/`;
const titleLead = 0.75;
const params = new URLSearchParams(window.location.search);
const embedded = window.parent !== window && params.get('embedded') === '1';

function getFraming(): Framing {
  if (window.matchMedia('(max-aspect-ratio: 19/25)').matches) return 'portrait';
  return window.matchMedia('(max-aspect-ratio: 71/50)').matches ? 'square' : 'wide';
}

function isTrailRoute() {
  return ['#trail', '#valley'].includes(window.location.hash);
}

function isPlaybackError(error: unknown) {
  return !(error instanceof DOMException && ['AbortError', 'NotAllowedError'].includes(error.name));
}

async function playWithAutoplayFallback(video: HTMLVideoElement, muteIfCurrent: () => boolean) {
  try {
    await video.play();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotAllowedError') || video.muted) throw error;
    if (muteIfCurrent()) await video.play();
  }
}

export function ValleyFilm() {
  const movie = useRef<HTMLVideoElement>(null);
  const theater = useRef<HTMLElement>(null);
  const introStarted = useRef(false);
  const playRequest = useRef(0);
  const resumeAfterResize = useRef<{ time: number; phase: Phase } | null>(null);
  const [framing, setFraming] = useState(getFraming);
  const [phase, setPhase] = useState<Phase>('loading');
  const [muted, setMuted] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [entered, setEntered] = useState(isTrailRoute);

  const setSoundMuted = useCallback((silent: boolean) => {
    if (movie.current) movie.current.muted = silent;
    setMuted(silent);
  }, []);

  const play = useCallback(async (restart = false) => {
    const video = movie.current;
    if (!video) return;

    const request = ++playRequest.current;
    if (video.error) video.load();
    if (restart) {
      resumeAfterResize.current = null;
      video.currentTime = 0;
      setTitleVisible(false);
    }

    setPhase('loading');
    try {
      await playWithAutoplayFallback(video, () => {
        if (request !== playRequest.current) return false;
        setSoundMuted(true);
        return true;
      });
    } catch (error) {
      if (request === playRequest.current && isPlaybackError(error)) setPhase('error');
    }
  }, [setSoundMuted]);

  useEffect(() => {
    function syncRoute() {
      setEntered(isTrailRoute());
    }

    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    if (entered) {
      ++playRequest.current;
      movie.current?.pause();
    }
  }, [entered]);

  useEffect(() => {
    if (entered || introStarted.current) return;
    introStarted.current = true;

    void play();
  }, [entered, play]);

  useEffect(() => {
    function onResize() {
      const video = movie.current;
      const next = getFraming();
      if (!video || next === framing) return;

      resumeAfterResize.current ??= { time: video.currentTime, phase };
      ++playRequest.current;
      setFraming(next);
    }

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [framing, phase]);

  function restorePosition(video: HTMLVideoElement) {
    const previous = resumeAfterResize.current;
    if (!previous || !Number.isFinite(video.duration)) return;
    resumeAfterResize.current = null;

    // Leave a decodable frame at the end when switching to a new crop.
    const lastFrame = Math.max(0, video.duration - 1 / 30);
    video.currentTime = previous.phase === 'ended' ? lastFrame : Math.min(previous.time, lastFrame);
    if (!entered && (previous.phase === 'playing' || previous.phase === 'loading')) {
      void play();
    } else {
      setPhase(previous.phase);
    }
  }

  function enterValley() {
    if (embedded) window.history.replaceState(null, '', '#trail');
    else window.history.pushState(null, '', '#trail');
    setEntered(true);
    theater.current?.focus({ preventScroll: true });
  }

  function toggleSound() {
    const silent = !muted;
    setSoundMuted(silent);

    if (movie.current?.paused && phase !== 'ended') void play();
  }

  const mediaError = !entered && phase === 'error';
  const SoundIcon = muted ? VolumeX : Volume2;

  return (
    <main className="theater" aria-label={entered ? 'Cloudridge Trail' : 'The Blue Valley arrival'} ref={theater} tabIndex={-1}>
      <video
        ref={movie}
        autoPlay={!entered && phase === 'loading' && !resumeAfterResize.current}
        aria-hidden={entered || undefined}
        aria-label="A giant bone descends into a blue mountain valley"
        playsInline
        muted={muted}
        preload={entered ? 'none' : 'auto'}
        poster={`${mediaRoot}arrival-${framing}.webp`}
        src={`${mediaRoot}arrival-${framing}.mp4`}
        onLoadedMetadata={(event) => restorePosition(event.currentTarget)}
        onPlaying={() => {
          if (!resumeAfterResize.current) setPhase('playing');
        }}
        onTimeUpdate={(event) => {
          if (resumeAfterResize.current) return;
          const { currentTime, duration } = event.currentTarget;
          setTitleVisible(Number.isFinite(duration) && currentTime >= duration - titleLead);
        }}
        onEnded={() => {
          setTitleVisible(true);
          setPhase('ended');
        }}
        onError={() => {
          resumeAfterResize.current = null;
          setPhase('error');
        }}
      />

      {!entered && titleVisible && (
        <h1 className="arrival-title"><span>Enter</span>{' '}<span>O’Keeffe’s World</span></h1>
      )}

      {!entered && phase === 'ended' && (
        <button className="film-button entry-button" type="button" onClick={enterValley}>
          Enter
          <ArrowRight size={17} strokeWidth={1.6} aria-hidden="true" />
        </button>
      )}

      {mediaError && (
        <div className="start-control">
          <p role="alert">The film couldn’t be loaded.</p>
          <button className="film-button start-button" type="button" onClick={() => void play(true)}>
            Try again
          </button>
        </div>
      )}

      {!entered && (
        <button className="film-button sound-button" type="button" onClick={toggleSound} aria-pressed={!muted} aria-label="Sound">
          <SoundIcon size={19} strokeWidth={1.65} aria-hidden="true" />
        </button>
      )}

      {!entered && phase === 'ended' && <span className="sr-only" role="status">Film ended</span>}
      {entered && <TrailScene />}
      {!embedded && <ConversationReturn chinese={params.get('lang') === 'zh'} />}
    </main>
  );
}
