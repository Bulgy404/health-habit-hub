import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

/** Per-language text, e.g. `{ en: 'Hello', de: 'Hallo' }`. */
export type LocaleText = Partial<Record<'en' | 'de' | 'fr' | 'ja' | 'nl', string>>;
export type Lang = keyof Required<LocaleText>;

export interface QuestionnaireSummary {
  id: string;
  slug: string;
  title: LocaleText;
  description: LocaleText;
  version: string;
  languages: Lang[];
  active: boolean;
  isLibrary: boolean;
  questionCount: number;
  updatedAt: string | null;
}

const API_BASE = apiUrl('/admin/questionnaires');

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
    const err = new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetches and manages the list of questionnaires for the questionnaires page.
 *
 * @param token - The NextAuth session access token.
 * @returns Questionnaire list state and a refetch callback.
 */
export function useQuestionnairesData(token: string) {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(API_BASE, token);
      setQuestionnaires(data as QuestionnaireSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load questionnaires');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { questionnaires, loading, error, refetch };
}
