import type { ComponentChildren } from 'preact';

export function ReaderProgress({ progress, children, ocr, showPercentage = true }: { progress: number; children: ComponentChildren; showPercentage?: boolean; ocr?: { progress: number; completed: number; total: number } | null }) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return <footer class="reader-progress" aria-label="Reading navigation">
    <div class="reading-progress-track" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
    <div class="reader-progress-location">{children}</div>
    <div class="reader-progress-status">
      {ocr && <span class="reader-ocr-status" role="progressbar" aria-label="OCR progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ocr.progress)}>OCR {ocr.completed}/{ocr.total}</span>}
      {showPercentage && <span class="reading-percentage">{percent}%</span>}
    </div>
  </footer>;
}
