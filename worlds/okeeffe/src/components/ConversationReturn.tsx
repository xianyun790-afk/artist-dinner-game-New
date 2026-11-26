import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import './scene-return.css';

function conversationUrl(chinese: boolean) {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const url = local
    ? new URL('/', location.href)
    : new URL('https://xianyun790-afk.github.io/artist-dinner-game-New/');
  if (local) url.port = '5187';
  if (chinese) url.searchParams.set('lang', 'zh');
  return url.href;
}

export function ConversationReturn({ chinese }: { chinese: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();

  useEffect(() => {
    if (!confirm) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [confirm]);

  const back = chinese ? '返回对话' : 'Back to conversation';
  return <>
    <button className="film-button conversation-return" type="button" onClick={() => setConfirm(true)}>
      <ArrowLeft size={17} strokeWidth={1.7} aria-hidden="true" />
      {back}
    </button>
    {confirm && <dialog ref={dialog} className="scene-return-confirmation" aria-labelledby={title} onCancel={event => {
      event.preventDefault();
      setConfirm(false);
    }}>
      <h2 id={title}>{chinese ? '返回对话？' : 'Return to the conversation?'}</h2>
      <div className="scene-return-actions">
        <button type="button" autoFocus onClick={() => setConfirm(false)}>{chinese ? '继续探索' : 'Keep exploring'}</button>
        <button type="button" onClick={() => window.location.assign(conversationUrl(chinese))}>{back}</button>
      </div>
    </dialog>}
  </>;
}
