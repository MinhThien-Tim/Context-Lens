import { useDialog } from '../components/useDialog';

export const ENGLISH101_FLASHCARDS_URL = 'https://minhthien-tim.github.io/English101/Vocabulary/personal-flashcards.html';

export function OnboardingCard({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return <aside class="onboarding-card" aria-labelledby="onboarding-card-title">
    <div><p class="eyebrow">New here?</p><h2 id="onboarding-card-title">Read, save, then review</h2><p>Tap a word for its meaning. Save useful vocabulary and review it later in English101.</p></div>
    <div class="onboarding-card-actions"><button class="text-button" onClick={onDismiss}>Dismiss</button><button class="secondary-button" onClick={onOpen}>See how it works</button></div>
  </aside>;
}

export function ContextLensOnboarding({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog(onClose);
  return <div class="modal-layer">
    <button class="modal-backdrop" aria-label="Close how Context Lens works" onClick={onClose} />
    <section ref={dialogRef} tabIndex={-1} class="settings-modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <header><div><p class="eyebrow">How it works</p><h2 id="onboarding-title">Read → Save → Review</h2></div><button class="icon-button close-button" onClick={onClose} aria-label="Close how Context Lens works">×</button></header>
      <ol class="onboarding-steps">
        <li><span aria-hidden="true">1</span><div><h3>Read normally</h3><p>Open an article, PDF, EPUB, DOCX, or paste text.</p></div></li>
        <li><span aria-hidden="true">2</span><div><h3>Tap a word or phrase</h3><p>Context Lens shows the meaning that fits the sentence.</p><div class="onboarding-example"><strong>indicated</strong><small>verb · showed / pointed out · cho thấy / chỉ ra</small></div></div></li>
        <li><span aria-hidden="true">3</span><div><h3>Save useful vocabulary</h3><p>Tap ☆ Save. The word, meaning, sentence, and source stay together.</p></div></li>
        <li><span aria-hidden="true">4</span><div><h3>Review in English101</h3><p>Context Lens and English101 are separate apps. Export your vocabulary here, then import the file into Personal Flashcards.</p></div></li>
      </ol>
      <div class="onboarding-transfer" aria-label="Vocabulary transfer steps"><strong>Context Lens</strong><span>Export ↓</span><strong>English101 Personal Flashcards</strong><span>Import</span></div>
      <a class="primary-button onboarding-cta" href={ENGLISH101_FLASHCARDS_URL} target="_blank" rel="noreferrer noopener">Open Personal Flashcards</a>
    </section>
  </div>;
}
