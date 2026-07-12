import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';

/** Per-language text, e.g. `{ en: 'Hello', de: 'Hallo' }`. */
export type LocaleText = Partial<Record<'en' | 'de' | 'fr' | 'ja' | 'nl', string>>;
export type Lang = keyof Required<LocaleText>;

export interface Cue {
  id: string;
  text: LocaleText;
  quality: 'low' | 'high';
  dimensions: { stability: number; salience: number; specificity: number };
  domain: string;
  languages: Lang[];
  createdAt: string | null;
}

const API_BASE = apiUrl('/admin/cue-pools');

async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetches and manages the paginated list of cues for the cue pools page.
 *
 * @param token - The NextAuth session access token.
 * @param page - The current page number.
 * @param filterQuality - Optional quality filter ('high' | 'low' | '').
 * @param filterLang - Optional language filter.
 * @returns Cue list state and a refetch callback.
 */
export function useCuePoolsData(
  token: string,
  page: number,
  filterQuality: string,
  filterLang: string,
) {
  const limit = 25;
  const [cues, setCues] = useState<Cue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Guards against a slower, superseded request (e.g. a stale page/filter
  // combination) resolving after a newer one and overwriting fresher state.
  const requestRef = useRef(0);

  const refetch = useCallback(
    async (p: number) => {
      if (!token) return;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(limit),
        });
        if (filterQuality) params.set('quality', filterQuality);
        if (filterLang) params.set('language', filterLang);
        const data = await apiFetch(`${API_BASE}?${params}`, token);
        if (requestId !== requestRef.current) return;
        setCues((data as { cues: Cue[] }).cues ?? []);
        setTotal((data as { total: number }).total ?? 0);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load cues');
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [token, filterQuality, filterLang],
  );

  useEffect(() => {
    refetch(page);
  }, [refetch, page]);

  return { cues, total, loading, error, limit, refetch };
}
