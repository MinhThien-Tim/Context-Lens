import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(onClose: () => void, active = true, modal = true) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (modal) (dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      const focusedDialog = document.activeElement?.closest('[role="dialog"]');
      if (focusedDialog && focusedDialog !== dialog) return;
      if (event.defaultPrevented || (document.querySelector('[aria-modal="true"]') && !dialog?.contains(document.activeElement))) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (!modal || event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (modal) { const other = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).find(element => element !== dialog); if (other) (other.querySelector<HTMLElement>(FOCUSABLE) ?? other).focus({ preventScroll: true }); else if (previous?.isConnected) previous.focus({ preventScroll: true }); } };
  }, [active, modal]);
  return ref;
}
