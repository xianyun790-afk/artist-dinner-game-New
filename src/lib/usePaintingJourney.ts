import { useEffect, useRef, useState } from 'react';
import type { PaintingMemory } from './types';
import { createPaintingJourney, initialPaintingJourney } from './paintingJourney';

export function usePaintingJourney(onArchive: (memory: PaintingMemory) => void) {
  const archive = useRef(onArchive); archive.current = onArchive;
  const [state, setState] = useState(initialPaintingJourney);
  const mounted = useRef(true);
  const controller = useRef<ReturnType<typeof createPaintingJourney> | null>(null);
  if (!controller.current) controller.current = createPaintingJourney({ onState: next => { if (mounted.current) setState(next); }, onArchive: memory => { if (mounted.current) archive.current(memory); } });
  const journey = controller.current;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; journey.cancel(); }; }, [journey]);
  return {
    state,
    begin: journey.begin,
    notice: journey.notice,
    capture: journey.capture,
    finish: journey.finish,
    pause: journey.pause,
    exit: journey.exit,
    cancel: journey.cancel,
    leave: journey.leave,
    loaded: journey.loaded,
    failed: journey.failed,
    replay: journey.replay,
  };
}
