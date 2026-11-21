import { t } from '@/lib/standingLanguage';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Painting } from '@/lib/paintings';
import { FramedPainting } from './FramedPainting';

export function PaintingScene({ painting, onLeave, subtitle, phase = 'viewing', onLoad, onError }: {
  painting: Painting; onLeave: () => void; subtitle: string | null;
  phase?: 'viewing' | 'framing' | 'filing' | 'replay'; onLoad?: () => void; onError?: () => void;
}) {
  const leave = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    leave.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onLeave(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      const target = previous?.isConnected && previous.closest('main') ? previous : document.querySelector<HTMLElement>('.room-type input, .speak-button');
      target?.focus({ preventScroll: true });
    };
  }, [onLeave]);
  return <section className={`painting-scene ${phase === 'framing' || phase === 'filing' ? 'is-framing' : ''} ${phase === 'filing' ? 'is-filing' : ''}`} data-painting-phase={phase} aria-label={t(`进入《${painting.title}》画中场景`, `Inside ${painting.englishTitle}`)}>
    <FramedPainting className="painting-object" painting={painting} onLoad={onLoad} onError={() => { setFailed(true); onError?.(); }}/>
    <button ref={leave} className="painting-leave" onClick={onLeave} disabled={phase === 'framing' || phase === 'filing'} aria-label={t("退出画布", "Leave painting")} title={t("退出画布（Esc）", "Leave painting (Esc)")}><X size={21} strokeWidth={1.4}/></button>
    {subtitle&&!failed&&<><div className="painting-subtitle-shade" aria-hidden="true"/><div className="painting-subtitle" role="status" aria-label={t("艺术家字幕", "Artist subtitles")}><p>{subtitle}</p></div></>}
    {(phase === 'framing' || phase === 'filing') && <p className="painting-keepsake" role="status">{phase === 'filing' ? t("已收入回忆", "Saved to memories") : t("把这一刻，留在回忆里。", "Framing this moment.")}</p>}
    {failed&&<p className="painting-scene-error" role="status">{t("画作暂时未能加载，可以退出画布后再试。", "This painting could not be loaded. Leave the canvas and try again.")}</p>}
  </section>;
}
