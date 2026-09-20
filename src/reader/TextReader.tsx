import { useEffect, useRef, useState } from 'preact/hooks';
import { normalizeSelection, sentenceContextAt, sentenceContextForRange, wordAtPoint } from '../lookup/context';

export interface ReaderSelection {
  text: string;
  offset: number;
  type: 'word' | 'phrase' | 'sentence';
  context: ReturnType<typeof sentenceContextAt>;
}

function rangeFromPoint(x: number, y: number): Range | null {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (documentWithCaret.caretRangeFromPoint) return documentWithCaret.caretRangeFromPoint(x, y);
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

export function TextReader({ content, safeHtml, onLookup, style }: { content: string; safeHtml?: string; onLookup: (selection: ReaderSelection) => void; style: Record<string, string | number> }) {
  const rootRef = useRef<HTMLElement>(null);
  const ignoreClick = useRef(false);
  const [pendingSelection, setPendingSelection] = useState<ReaderSelection | null>(null);

  const readSelectedPhrase = (): ReaderSelection | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode) || !rootRef.current?.contains(selection.focusNode)) return null;
    const text = normalizeSelection(selection.toString());
    if (!text) return null;
    const range = selection.getRangeAt(0);
    const fullText = rootRef.current.textContent ?? '';
    const before = document.createRange();
    before.selectNodeContents(rootRef.current);
    before.setEnd(range.startContainer, range.startOffset);
    const offset = before.toString().length;
    const context = sentenceContextForRange(fullText, offset, offset + range.toString().length);
    return { text, offset, type: text.includes(' ') ? normalizeSelection(context.current) === text ? 'sentence' : 'phrase' : 'word', context };
  };

  const captureSelection = () => {
    const next = readSelectedPhrase();
    if (next) { setPendingSelection(next); ignoreClick.current = true; }
  };
  useEffect(() => {
    let selectionTimer: number | undefined;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) { setPendingSelection(null); return; }
      clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(captureSelection, 80);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => { clearTimeout(selectionTimer); document.removeEventListener('selectionchange', onSelectionChange); };
  }, []);

  return (
    <>
    <article
      ref={rootRef}
      data-reader-text
      class="reader-text"
      tabIndex={0}
      aria-label="Document content. Select text and press Enter to look up a phrase."
      style={style}
      onPointerUp={() => { window.setTimeout(captureSelection, 0); }}
      onKeyDown={(event) => { if (event.key === 'Enter') { const selected = readSelectedPhrase(); if (selected) { onLookup(selected); event.preventDefault(); } } }}
      onClick={(event) => {
        if (ignoreClick.current) { ignoreClick.current = false; return; }
        setPendingSelection(null);
        const range = rangeFromPoint(event.clientX, event.clientY);
        if (!range || !rootRef.current?.contains(range.startContainer)) return;
        const word = wordAtPoint(range);
        if (!word) return;
        onLookup({ text: word.text, offset: word.offset, type: 'word', context: sentenceContextAt(rootRef.current.textContent ?? '', word.offset) });
      }}
    >
      {safeHtml
        ? <div class="article-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        : content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph.trim()}</p>)}
    </article>
    {pendingSelection && <button class="selection-lookup" onPointerDown={(event) => event.preventDefault()} onClick={() => { onLookup(pendingSelection); setPendingSelection(null); window.getSelection()?.removeAllRanges(); }}>Look up selection</button>}
    </>
  );
}
