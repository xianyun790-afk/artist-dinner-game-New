import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LampWallUp } from 'lucide-react';
import { t } from '@/lib/standingLanguage';
import { SceneReturnConfirmation } from '@/components/ui/SceneReturnConfirmation';
import { cafeRoute } from './cafeRoute';
import { artDirectory } from './cafeWorld';
import { mountCafeScene } from './createCafeScene';
import './cafe.css';

type Phase = 'loading' | 'ready' | 'error';
const painting = artDirectory + 'painting.webp';

export default function CafeApp({ onLeave }: { onLeave?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const guides = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof mountCafeScene> | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(0);
  const [lit, setLit] = useState(true);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [phonePortrait] = useState(() => window.matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 640px)'));
  const [rotated, setRotated] = useState(phonePortrait.matches);

  useEffect(() => {
    const sync = () => setRotated(phonePortrait.matches);
    sync();
    phonePortrait.addEventListener('change', sync);
    return () => phonePortrait.removeEventListener('change', sync);
  }, [phonePortrait]);

  useEffect(() => {
    if (!canvas.current || !guides.current) return;
    try {
      scene.current = mountCafeScene(canvas.current, guides.current, () => setPhase('ready'), () => setPhase('error'), phonePortrait);
    } catch {
      setPhase('error');
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [attempt, phonePortrait]);

  useEffect(() => {
    scene.current?.setLit(lit);
  }, [lit, attempt]);

  useEffect(() => {
    if (confirmReturn) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      setConfirmReturn(true);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirmReturn]);

  const returnToConversation = () => {
    if (onLeave) onLeave();
    else window.location.assign(import.meta.env.BASE_URL + t('?lang=zh', ''));
  };

  return (
    <main className="cafe-app" data-rotated={rotated}>
      <section className="cafe-stage" aria-label={t('全景街景', 'Panoramic street scene')} data-phase={phase}>
        <img className="cafe-poster" src={painting} alt="" fetchPriority="high" />
        <canvas ref={canvas} className="cafe-canvas" tabIndex={phase === 'ready' ? 0 : -1}
          aria-hidden={phase !== 'ready'} aria-label={t('拖动或使用方向键环顾四周', 'Drag or use the arrow keys to look around')}
        />
        <div ref={guides} className="cafe-guides" role="group" aria-label={t('探索指引', 'Exploration guides')} hidden={phase !== 'ready'}>
          {cafeRoute.map((stop, index) => (
            <button key={stop.label} type="button" className="cafe-guide" aria-label={t(stop.label, stop.english)} onClick={() => {
              scene.current?.walkTo(index);
              canvas.current?.focus({ preventScroll: true });
            }} />
          ))}
        </div>
      </section>

      <header className="cafe-header">
        <button className="cafe-home" type="button" onClick={() => setConfirmReturn(true)}>
          <ArrowLeft size={17} strokeWidth={1.7} aria-hidden="true" />
          {t('返回对话', 'Back to conversation')}
        </button>
      </header>

      {phase === 'loading' && <p className="cafe-status" role="status">{t('正在加载场景…', 'Loading the scene…')}</p>}
      {phase === 'error' && (
        <div className="cafe-status">
          <p role="status">{t('3D 场景暂时打不开。', 'The 3D scene couldn’t load.')}</p>
          <button type="button" className="cafe-outline" onClick={() => {
            setPhase('loading');
            setAttempt(value => value + 1);
          }}>{t('重新加载', 'Reload scene')}</button>
        </div>
      )}
      {phase === 'ready' && (
        <footer className="cafe-controls">
          <button className="cafe-outline cafe-lamp" type="button" aria-pressed={lit} onClick={() => setLit(!lit)}>
            <LampWallUp size={17} strokeWidth={1.65} aria-hidden="true" />
            {lit ? t('熄灯', 'Lights off') : t('点灯', 'Lights on')}
          </button>
        </footer>
      )}
      {confirmReturn && <SceneReturnConfirmation rotated={rotated} onStay={() => setConfirmReturn(false)} onReturn={returnToConversation} />}
    </main>
  );
}
