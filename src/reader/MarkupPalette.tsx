import type { ReaderHighlight } from '../db/database';

export type MarkupTool = 'highlight' | 'underline' | 'eraser';

export function MarkupPalette({ tool, color, onToolChange, onColorChange, onClose }: {
  tool: MarkupTool | null;
  color: ReaderHighlight['color'];
  onToolChange: (tool: MarkupTool | null) => void;
  onColorChange: (color: ReaderHighlight['color']) => void;
  onClose: () => void;
}) {
  const chooseTool = (next: MarkupTool) => onToolChange(tool === next ? null : next);
  return <div class="reader-highlight-palette" role="dialog" aria-label="Markup tools">
    <div class="reader-markup-tools" role="group" aria-label="Markup tool">
      <button class={tool === 'highlight' ? 'active' : ''} aria-pressed={tool === 'highlight'} onClick={() => chooseTool('highlight')}><span class="markup-icon markup-highlight" aria-hidden="true"><i /></span><span>Highlight</span></button>
      <button class={tool === 'underline' ? 'active' : ''} aria-pressed={tool === 'underline'} onClick={() => chooseTool('underline')}><span class="markup-icon markup-underline" aria-hidden="true"><i /></span><span>Pen</span></button>
      <button class={tool === 'eraser' ? 'active' : ''} aria-pressed={tool === 'eraser'} onClick={() => chooseTool('eraser')}><span class="markup-icon markup-eraser" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 20-4-4L14 5a2.8 2.8 0 0 1 4 0l1 1a2.8 2.8 0 0 1 0 4L9 20Z"/><path d="m11 8 5 5M7 20h14"/></svg></span><span>Eraser</span></button>
    </div>
    <div class="reader-highlight-colors" role="group" aria-label="Markup color">
      {(['yellow', 'pink', 'blue'] as const).map(next => <button key={next} class={`highlight-color highlight-color-${next} ${color === next ? 'selected' : ''}`} aria-label={`Use ${next}`} aria-pressed={color === next} disabled={tool === 'eraser'} onClick={() => { onColorChange(next); onToolChange(tool ?? 'highlight'); }} />)}
    </div>
    <button class="markup-done" onClick={onClose}>Done</button>
  </div>;
}
