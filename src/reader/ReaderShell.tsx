import type { ComponentChildren } from 'preact';
export function ReaderShell({ children, contentsOpen, contextOpen }: { children: ComponentChildren; contentsOpen: boolean; contextOpen: boolean }) {
  return <div class={`reader-shell ${contentsOpen ? 'has-contents' : ''} ${contextOpen ? 'has-context' : ''}`}>{children}</div>;
}
