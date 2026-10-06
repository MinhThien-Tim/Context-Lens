import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function usePdfDocument(data?: Blob) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const updatePasswordRef = useRef<((password: string) => void) | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    // A new file must never inherit the previous file's state: otherwise an encrypted document
    // leaves `passwordRequired` set and the next document renders the password form forever.
    setPdf(null); setError(null); setPasswordRequired(false); setPasswordError(null); setPassword('');
    updatePasswordRef.current = null;
    submittedRef.current = false;
    if (!data) { setError('The original PDF file is unavailable.'); return; }
    let disposed = false;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    let destroyed = false;
    // `task.promise` settling after teardown and the teardown itself can both reach for the
    // task; pdf.js rejects a second `destroy()`, so it is idempotent by hand here.
    const destroy = () => { if (task && !destroyed) { destroyed = true; void task.destroy(); } };
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({ data: bytes });
        task.onPassword = (updatePassword: (password: string) => void) => {
          updatePasswordRef.current = updatePassword;
          // pdf.js re-fires `onPassword` when it rejects a submitted password, so a prompt
          // that arrives after a submit is a wrong password, not a fresh requirement.
          setPasswordError(submittedRef.current ? 'That password did not unlock this PDF.' : null);
          submittedRef.current = false;
          setPasswordRequired(true);
        };
        const loaded = await task.promise;
        if (disposed) { destroy(); return; }
        setPdf(loaded); setError(null); setPasswordRequired(false); setPasswordError(null); setPassword('');
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.');
      }
    })();
    return () => { disposed = true; updatePasswordRef.current = null; destroy(); };
  }, [data]);

  const submitPassword = () => {
    const update = updatePasswordRef.current;
    if (!update || !password) return;
    submittedRef.current = true;
    setPasswordError(null);
    // The form stays mounted until pdf.js actually resolves: a wrong password re-prompts via
    // `onPassword`, so unmounting here would flash the empty PDF state instead of the reason.
    update(password);
  };
  return { pdf, error, passwordRequired, passwordError, password, setPassword, submitPassword };
}
