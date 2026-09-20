import { useEffect, useState } from 'preact/hooks';
export function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    const change = () => setDesktop(query?.matches ?? false);
    query?.addEventListener('change', change);
    return () => query?.removeEventListener('change', change);
  }, []);
  return desktop;
}
