'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Accessible modal: labelled, traps initial focus, closes on Escape. */
export function Dialog({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          {description ? <div className="muted small">{description}</div> : null}
        </div>
        {children ? <div className="dialog-body">{children}</div> : null}
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  );
}
