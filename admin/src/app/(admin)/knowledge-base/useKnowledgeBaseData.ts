import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiUrl } from '@/lib/api';

interface KbEntry {
  filename: string;
  category: string;
  file_size: number;
  has_summary: boolean;
  upload_date: string;
}

const API_BASE = apiUrl('/kb');

/**
 * Fetches and manages the list of knowledge base entries.
 *
 * @param token - The NextAuth session access token.
 * @returns Knowledge base entry list state and a refetch callback.
 */
export function useKnowledgeBaseData(token: string) {
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<KbEntry[]>(API_BASE, token);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { entries, loading, error, refetch: fetchList };
}
