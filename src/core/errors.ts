export type EngineErrorCode = 'NETWORK' | 'TIMEOUT' | 'UNSUPPORTED_LANGUAGE' | 'QUOTA' | 'PROVIDER_DOWN' | 'OFFLINE' | 'INVALID_RESPONSE' | 'ABORTED';
export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode) { super(code); this.name = 'EngineError'; }
}
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new EngineError('ABORTED');
}
/** The deadline covers availability checks and parsing, even for adapters ignoring abort. */
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new EngineError('ABORTED')); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new EngineError('TIMEOUT')); }, ms);
  });
  try { return await Promise.race([work(controller.signal), deadline]); }
  finally { clearTimeout(timer!); signal?.removeEventListener('abort', abort); }
}
