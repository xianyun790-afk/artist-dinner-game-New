import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '@/lib/standingLanguage';
export function Modal({ title, subtitle, children, onClose, wide=false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const els = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]');
        if (!els?.length) return;
        const first=els[0], last=els[els.length-1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown',key);
    return () => { document.body.style.overflow=old; document.removeEventListener('keydown',key); previous?.focus(); };
  },[onClose]);
  return <div className="modal-shade" onMouseDown={e => { if(e.target===e.currentTarget)onClose(); }}><div role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide?'wide':''}`} ref={ref} tabIndex={-1}><header className="modal-header"><div><span className="eyebrow">AFTERGLOW / YOUR EVENING</span><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" aria-label={t("关闭弹窗", "Close dialog")} onClick={onClose}><X size={21}/></button></header>{children}</div></div>;
}
