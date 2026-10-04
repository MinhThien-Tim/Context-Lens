import type { ComponentChildren } from 'preact';

interface Props {
  progress: number;
  children: ComponentChildren;
  ocr?: { progress: number; completed: number; total: number } | null;
  showPercentage?: boolean;
  /** Contract §8.2: direct Footer zoom control (decrease / level readout / increase). Null when the
      document has no PDF surface to zoom. Never a popup or menu (§8.3). */
  zoom?: ComponentChildren;
}

// Contract §8: the Footer owns progress, location, percentage, PDF zoom, and OCR
// status while a run is active. OCR status is a live indicator, not a permanent control (§8.4/§14.6).
// More trigger moved to Header toolbar at ≥1024px.
export function ReaderProgress({ progress, children, ocr, showPercentage = true, zoom }: Props) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return <footer class="reader-progress" aria-label="Reading navigation">
    <div class="reading-progress-track" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
    <div class="reader-progress-location">{children}</div>
    <div class="reader-progress-status">
      {ocr && <span class="reader-ocr-status" role="progressbar" aria-label="OCR progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ocr.progress)}>OCR {ocr.completed}/{ocr.total}</span>}
      {showPercentage && <span class="reading-percentage">{percent}%</span>}
      {zoom}
    </div>
  </footer>;
}