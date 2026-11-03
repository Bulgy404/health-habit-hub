import { useCallback, useEffect, useState, useRef } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

/** Per-language text, e.g. `{ en: 'Hello', de: 'Hallo' }`. */
export type LocaleText = Partial<Record<"en" | "de" | "fr" | "ja" | "nl", string>>;
export type Lang = keyof Required<LocaleText>;

export interface QuestionnaireSummary {
  id: string;
  studyId?: string | null;
  canEdit?: boolean;
  slug: string;
  title: LocaleText;
  description: LocaleText;
  version: string;
  languages: Lang[];
  active: boolean;
  isLibrary: boolean;
  // 'study' (default): anchored to enrollment, applies once per participant.
  // 'habit': anchored to each habit's creation, applies once per habit.
  scope: "study" | "habit" | "donation";
  questionCount: number;
  updatedAt: string | null;
}

const API_BASE = apiUrl("/admin/questionnaires");

/**
 * Fetches and manages the list of questionnaires for the questionnaires page.
 *
 * @param token - The NextAuth session access token.
 * @returns Questionnaire list state and a refetch callback.
 */
export function useQuestionnairesData(token: string, studyId = "") {
  const requestId = useRef(0);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!token) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`${API_BASE}${studyId ? `?studyId=${studyId}` : ""}`, token);
      if (currentRequest !== requestId.current) return;
      setQuestionnaires(data as QuestionnaireSummary[]);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setQuestionnaires([]);
      setError(err instanceof Error ? err.message : "Failed to load questionnaires");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [token, studyId]);

  useEffect(() => {
    const generation = requestId;
    refetch();
    return () => {
      generation.current++;
    };
  }, [refetch]);

  return { questionnaires, loading, error, refetch };
}
