import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface StudyGroup {
  id: string;
  label: string;
  index: number;
  cueConfig?: {
    cueCount: 'single' | 'multi';
    cueSource: 'low_quality' | 'high_quality' | 'self_selected';
    cuePoolId: string | null;
    behaviorOptions: string[];
    maxHabits: number | null;
  } | null;
}

export interface StudySummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  groups: StudyGroup[];
  questionnaires: string[];
  participantCount: number;
  createdAt: string | null;
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1') +
  '/admin/studies';

async function fetchStudies(token: string): Promise<StudySummary[]> {
  const res = await fetch(API_BASE, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data)
    ? (data as StudySummary[])
    : (data as { studies?: StudySummary[] }).studies ?? [];
}

/**
 * Fetches and manages the list of studies for the studies page.
 *
 * @returns Study list state and a refetch callback.
 */
export function useStudiesData() {
  const { data: session } = useSession();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? '';

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const items = await fetchStudies(token);
      setStudies(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load studies');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { studies, loading, error, token, refetch };
}
