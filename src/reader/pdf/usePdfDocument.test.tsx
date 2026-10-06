import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePdfDocument } from './usePdfDocument';

type Task = {
  onPassword?: (update: (password: string) => void) => void;
  promise: Promise<PDFDocumentProxy>;
  destroy: () => Promise<void>;
};

const { tasks, destroyed } = vi.hoisted(() => ({
  tasks: [] as Task[],
  destroyed: [] as number[],
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => {
    const task: Task = { promise: Promise.resolve({ numPages: 1 } as unknown as PDFDocumentProxy), destroy: async () => { destroyed.push(tasks.indexOf(task)); } };
    tasks.push(task);
    return task;
  },
}));

const host = document.createElement('div');
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  tasks.length = 0;
  destroyed.length = 0;
});

const blob = () => {
  // jsdom's Blob has no `arrayBuffer()`, which `usePdfDocument` calls, so supply one explicitly.
  const value = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  (value as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () => Promise.resolve(new ArrayBuffer(8));
  return value;
};

function Harness({ data }: { data?: Blob }) {
  const state = usePdfDocument(data);
  return <div>
    <span data-testid="pdf">{state.pdf ? 'ready' : 'none'}</span>
    <span data-testid="error">{state.error ?? ''}</span>
    <span data-testid="required">{String(state.passwordRequired)}</span>
    <span data-testid="password-error">{state.passwordError ?? ''}</span>
    <button onClick={() => { state.setPassword('hunter2'); }}>set</button>
    <button onClick={() => state.submitPassword()}>submit</button>
  </div>;
}

const settle = async (until: () => boolean = () => tasks.length > 0) => {
  // `usePdfDocument` loads pdf.js through a dynamic import inside an async IIFE, so the task only
  // exists after several microtask turns plus the module resolution; poll rather than guess.
  for (let i = 0; i < 40 && !until(); i += 1) await act(async () => { await new Promise(done => setTimeout(done, 5)); });
  for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); });
};
const read = (id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent;

it('resets every field when the file changes, so an encrypted file cannot strand the next one', async () => {
  document.body.append(host);
  await act(async () => { render(<Harness data={blob()} />, host); });
    await settle(() => tasks.length > 0 && read('pdf') === 'ready');
  expect(read('pdf')).toBe('ready');

  // The encrypted file prompts; the state must not survive into the next document.
  await act(async () => { tasks[0].onPassword?.(() => {}); });
  expect(read('required')).toBe('true');

  await act(async () => { render(<Harness data={blob()} />, host); });
    await settle(() => tasks.length > 1 && read('pdf') === 'ready');
  expect(read('required')).toBe('false');
  expect(read('password-error')).toBe('');
  expect(read('pdf')).toBe('ready');
});

it('reports a wrong password instead of silently re-prompting with no explanation', async () => {
  document.body.append(host);
  await act(async () => { render(<Harness data={blob()} />, host); });
  await settle(() => tasks.length > 0 && read('pdf') === 'ready');

  await act(async () => { tasks[0].onPassword?.(() => {}); });
  expect(read('required')).toBe('true');
  expect(read('password-error')).toBe('');

  await act(async () => { host.querySelectorAll('button')[0].click(); });
  await act(async () => { host.querySelectorAll('button')[1].click(); });

  // pdf.js re-fires onPassword after rejecting the submitted password.
  await act(async () => { tasks[0].onPassword?.(() => {}); });
  expect(read('password-error')).toContain('did not unlock');
  expect(read('required')).toBe('true');
});

it('does not label the first prompt as a wrong password', async () => {
  document.body.append(host);
  await act(async () => { render(<Harness data={blob()} />, host); });
  await settle(() => tasks.length > 0 && read('pdf') === 'ready');
  expect(read('password-error')).toBe('');
});

it('destroys the loading task exactly once when the file changes after the load settles', async () => {
  document.body.append(host);
  await act(async () => { render(<Harness data={blob()} />, host); });
  await settle(() => tasks.length > 0 && read('pdf') === 'ready');
  await act(async () => { render(<Harness data={blob()} />, host); });
  await settle(() => tasks.length > 1 && read('pdf') === 'ready');
  await act(async () => render(null, host));
  // Each task is destroyed once; a duplicate destroy would show up as a repeated index.
  expect(new Set(destroyed).size).toBe(destroyed.length);
  expect(destroyed.length).toBe(tasks.length);
});

it('destroys the task once when unmounting mid-load', async () => {
  document.body.append(host);
  await act(async () => { render(<Harness data={blob()} />, host); });
  await settle(() => tasks.length > 0);
  tasks[0].promise = new Promise(() => {});
  await act(async () => render(null, host));
  expect(destroyed.length).toBe(1);
});