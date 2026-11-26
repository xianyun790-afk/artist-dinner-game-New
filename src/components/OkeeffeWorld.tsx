import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { language, t } from '@/lib/standingLanguage';
import { SceneReturnConfirmation } from './ui/SceneReturnConfirmation';

export function OkeeffeWorld({ src, onLeave }: { src: string; onLeave: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const url = new URL(src, window.location.href);
  url.searchParams.set('lang', language);
  url.searchParams.set('embedded', '1');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const title = t('欧姬芙的世界', 'O’Keeffe’s World');
  return <dialog ref={dialogRef} className="okeeffe-world" aria-label={title} onCancel={event => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setConfirmReturn(true);
  }}>
    <button className="okeeffe-world-back" type="button" onClick={() => setConfirmReturn(true)}>
      <ArrowLeft size={17} aria-hidden="true" />{t('返回对话', 'Back to conversation')}
    </button>
    <iframe title={title} src={url.href} allow="autoplay; fullscreen" />
    {confirmReturn && <SceneReturnConfirmation onStay={() => setConfirmReturn(false)} onReturn={onLeave} />}
  </dialog>;
}
