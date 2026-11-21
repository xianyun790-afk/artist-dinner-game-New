import { gameAsset } from '@/lib/gameAssets';
import { forwardRef, useEffect, useRef } from 'react';

export const Live2DClayPortrait = forwardRef<HTMLDivElement, { speaking: boolean; thinking: boolean }>(function Live2DClayPortrait({ speaking, thinking }, forwardedRef) {
  const puppet = useRef<HTMLDivElement>(null);
  const openMouth = useRef<HTMLImageElement>(null);
  const live = useRef({ speaking, thinking });
  live.current = { speaking, thinking };

  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const t = now - started;
      const state = live.current;
      const mouth = state.speaking
        ? Math.max(.04, Math.min(.72, .3 + Math.sin(t * .019) * .2 + Math.sin(t * .047 + 1.4) * .16))
        : 0;
      if (openMouth.current) {
        openMouth.current.style.opacity = String(mouth * .8);
        openMouth.current.style.transform = `scaleY(${.88 + mouth * .16})`;
      }
      if (puppet.current) {
        const sway = Math.sin(t * .00055) * .16 + (state.thinking ? -.35 : 0);
        const breath = 1 + Math.sin(t * .00115) * .0025;
        puppet.current.style.transform = `translateY(${Math.sin(t * .0011) * .25}%) rotate(${sway}deg) scale(${breath})`;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); };
  }, []);

  return <div className="live2d-clay-actor" ref={forwardedRef} aria-hidden="true">
    <div className="live2d-clay-puppet" ref={puppet}>
      <img className="live2d-layer live2d-body" src={gameAsset('/live2d/clay-painter/body.png')} alt="" draggable={false}/>
      <img className="live2d-layer live2d-mouth live2d-mouth-closed" src={gameAsset('/live2d/clay-painter/mouth-closed.png')} alt="" draggable={false}/>
      <img ref={openMouth} className="live2d-layer live2d-mouth live2d-mouth-open" src={gameAsset('/live2d/clay-painter/mouth-open.png')} alt="" draggable={false}/>
      <span className="live2d-proof">Live2D 试验</span>
    </div>
  </div>;
});
