export interface DebouncedTask {
  run: () => void;
  flush: () => void;
  cancel: () => void;
}

export function debounce(task: () => void, delayMs: number): DebouncedTask {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    run() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; task(); }, delayMs);
    },
    flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = undefined;
      task();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  };
}
