export function canPronounce(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function pronounceEnglish(text: string): boolean {
  if (!canPronounce() || !text.trim()) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  const voice = speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith('en'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
  return true;
}
