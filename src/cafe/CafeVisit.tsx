import { useEffect, useRef } from 'react';
import { t } from '@/lib/standingLanguage';
import CafeApp, { type CafeLighting } from './CafeApp';

export function CafeVisit({ onLeave }: { onLeave: (lighting: CafeLighting) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const leave = (lighting: CafeLighting) => {
    ref.current?.close();
    onLeave(lighting);
  };

  return (
    <dialog ref={ref} className="cafe-visit" aria-label={t('夜间露天咖啡座', 'Café Terrace at Night')} onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
    }}>
      <CafeApp onLeave={leave} />
    </dialog>
  );
}
