import type { ComponentChildren } from 'preact';
import { useDesktop } from '../components/useDesktop';

interface Props {
  progress: number;
  children: ComponentChildren;
  ocr?: { progress: number; completed: number; total: number } | null;
  /** Contract §8.1: the single More trigger is Footer-owned at mobile density. Desktop keeps its More
      in the Header toolbar (docs/desktop-reader.md §2), so App.tsx passes this only when !desktop. */
  moreTrigger?: ComponentChildren;
  /** Contract §8.2: the Markup trigger is Footer-owned at mobile density. */
  markupTrigger?: ComponentChildren;
  /** Contract §8.5: the Contents trigger is Footer-owned at mobile density. */
  contentsTrigger?: ComponentChildren;
}

// Contract §8: the Footer owns progress, location, percentage, PDF zoom, the More trigger and OCR
// status while a run is active. OCR status is a live indicator, not a permanent control (§8.4/§14.6).
export function ReaderProgress({ progress, children, ocr, moreTrigger, markupTrigger, contentsTrigger }: Props) {
  const desktop = useDesktop();
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  
  if (desktop) {
    // Desktop: thin single-row band — page number · progress line · OCR status while active
    return <footer class="reader-progress reader-progress-desktop" aria-label="Reading navigation">
      <div class="reading-progress-track" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
      <div class="reader-progress-bar">
        <div class="reader-progress-location">{children}</div>
      </div>
      <div class="reader-progress-status">
        {ocr && <span class="reader-ocr-status" role="progressbar" aria-label="OCR progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ocr.progress)}>OCR {ocr.completed}/{ocr.total}</span>}
      </div>
    </footer>;
  }
  
  // Mobile: one full-width single-row bar — Contents · page number · Markup · More + hairline progress
  return <footer class="reader-progress reader-progress-mobile" aria-label="Reading navigation">
    <div class="reading-progress-track" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
    <div class="reader-progress-bar">
      {contentsTrigger}
      <div class="reader-progress-location">{children}</div>
      {markupTrigger}
      {moreTrigger}
    </div>
  </footer>;
}