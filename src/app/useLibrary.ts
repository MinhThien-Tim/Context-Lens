import { useEffect, useState } from 'preact/hooks';
import { queryDocumentLibrary, type DocumentRecord } from '../db/database';

export function useLibrary() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<DocumentRecord['kind'] | 'all'>('all');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void queryDocumentLibrary({ query, kind, limit: 18 }).then(result => {
        if (cancelled) return;
        setDocuments(result.items); setHasMore(result.hasMore);
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, kind]);

  const refresh = async () => {
    const result = await queryDocumentLibrary({ query, kind, limit: 18 });
    setDocuments(result.items); setHasMore(result.hasMore);
  };

  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await queryDocumentLibrary({ query, kind, offset: documents.length, limit: 18 });
      setDocuments(items => [...items, ...result.items]); setHasMore(result.hasMore);
    } finally { setLoading(false); }
  };

  return { documents, query, setQuery, kind, setKind, hasMore, loading, refresh, loadMore };
}
