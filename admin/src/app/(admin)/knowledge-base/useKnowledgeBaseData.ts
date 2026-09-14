import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

export interface KbEntry {
  filename: string;
  category: string;
  file_size: number;
  has_summary: boolean;
  upload_date: string;
  /** Display citation — from the curated BibLaTeX entry, or the filename. */
  citation: string;
  /** DOI or publisher link. Empty when nothing was curated; never guessed. */
  url: string;
  /** Whether a BibLaTeX entry exists, so the list can flag the ones missing one. */
  has_reference: boolean;
}

const API_BASE = apiUrl("/kb");

/**
 * Fetches and manages the list of knowledge base entries.
 *
 * @param token - The NextAuth session access token.
 * @returns Knowledge base entry list state and a refetch callback.
 */
export function useKnowledgeBaseData(token: string) {
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<KbEntry[]>(API_BASE, token);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { entries, loading, error, refetch: fetchList };
}
