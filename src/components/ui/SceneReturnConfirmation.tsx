import { useEffect, useId, useRef } from 'react';
import { t } from '@/lib/standingLanguage';
import './scene-return.css';

export function SceneReturnConfirmation({ onStay, onReturn, painting = false, rotated = false }: {
  onStay: () => void;
  onReturn: () => void;
  painting?: boolean;
  rotated?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={ref} className="scene-return-confirmation" data-rotated={rotated || undefined}
    aria-labelledby={title} onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      onStay();
    }}>
    <h2 id={title}>{t('返回对话？', 'Return to the conversation?')}</h2>
    <div className="scene-return-actions">
      <button type="button" autoFocus onClick={onStay}>
        {painting ? t('继续看画', 'Keep viewing') : t('继续探索', 'Keep exploring')}
      </button>
      <button type="button" onClick={onReturn}>{t('返回对话', 'Back to conversation')}</button>
    </div>
  </dialog>;
}
