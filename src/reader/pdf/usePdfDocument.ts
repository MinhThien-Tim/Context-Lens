import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function usePdfDocument(data?: Blob) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const updatePasswordRef = useRef<((password: string) => void) | null>(null);

  useEffect(() => {
    if (!data) { setError('The original PDF file is unavailable.'); return; }
    let disposed = false;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({ data: bytes });
        task.onPassword = (updatePassword: (password: string) => void) => {
          updatePasswordRef.current = updatePassword;
          setPasswordRequired(true);
        };
        const loaded = await task.promise;
        if (disposed) { await task.destroy(); return; }
        setPdf(loaded); setError(null);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : 'Unable to open this PDF.');
      }
    })();
    return () => { disposed = true; updatePasswordRef.current = null; void task?.destroy(); setPdf(null); };
  }, [data]);

  const submitPassword = () => {
    if (!password) return;
    updatePasswordRef.current?.(password);
    setPasswordRequired(false);
    setPassword('');
  };
  return { pdf, error, passwordRequired, password, setPassword, submitPassword };
}
