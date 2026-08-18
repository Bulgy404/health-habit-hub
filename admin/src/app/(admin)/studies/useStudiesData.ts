import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch, apiUrl } from "@/lib/api";

// How often the studies list polls for changes made by other admins, while
// the tab is visible. Matches the system page's REFRESH_MS.
const REFRESH_MS = 30_000;

type ReminderModeValue = {
  mode: "off" | "participant_choice" | "admin_fixed";
  time: string | null;
};

type RemindersConfig = {
  habit: ReminderModeValue;
  questionnaire: ReminderModeValue;
  endOfStudy: ReminderModeValue;
  studyUpdate: ReminderModeValue;
};

interface StudyGroup {
  id: string;
  label: string;
  index: number;
  cueConfig?: {
    cueCount: "single" | "multi";
    cueSource: "low_quality" | "high_quality" | "self_selected";
    cuePoolId: string | null;
    maxHabits: number | null;
  } | null;
  onboardingEnabled?: boolean | null;
  selfHabitCreationEnabled?: boolean | null;
  recommenderEnabled?: boolean | null;
  /** null = inherit the study-level habit-entry-mode setting for this group. */
  habitEntryMode?: "freeText" | "structured" | null;
  structuredActivityKeys?: string[] | null;
  reminders?: {
    habit: ReminderModeValue | null;
    questionnaire: ReminderModeValue | null;
    endOfStudy: ReminderModeValue | null;
    studyUpdate: ReminderModeValue | null;
  } | null;
  // §7.1/§7.2/§7.3/§7.5 group-level overrides (null = inherit study-level).
  habitStackingEnabled?: boolean | null;
  reminderContentMode?: "generic" | "implementation_intention" | null;
  informationOverloadGuard?: InformationOverloadGuard | null;
  gamificationEnabled?: boolean | null;
  // Habit-donation input mode + optional post-donation questionnaire
  // (null = inherit study-level).
  donationInputMode?: "text" | "speech" | "both" | null;
  donationQuestionnaireSlug?: string | null;
}

/** §7.3 Information Overload guard — a growing per-type habit cap. */
export interface InformationOverloadGuard {
  enabled: boolean;
  userOptOutAllowed: boolean;
}

export interface StudySummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  recommenderEnabled: boolean;
  onboardingEnabled: boolean;
  selfHabitCreationEnabled: boolean;
  /** Study-wide — applies to every group. Off (default) = free-text habit entry. */
  habitEntryMode: "freeText" | "structured";
  /** Activity-type catalog keys offered when habitEntryMode is 'structured'. */
  structuredActivityKeys: string[];
  // §7.1/§7.2/§7.3/§7.5 study-level feature config.
  habitStackingEnabled: boolean;
  reminderContentMode: "generic" | "implementation_intention";
  informationOverloadGuard: InformationOverloadGuard | null;
  gamificationEnabled: boolean;
  donationInputMode: "text" | "speech" | "both";
  donationQuestionnaireSlug: string | null;
  reminders?: RemindersConfig;
  endDate?: string | null;
  endOfStudyNotification?: { title: string; body: string };
  groups: StudyGroup[];
  questionnaires: string[];
  participantCount: number;
  createdAt: string | null;
}

const API_BASE = apiUrl("/admin/studies");

async function fetchStudies(token: string): Promise<StudySummary[]> {
  const data = await apiFetch<StudySummary[] | { studies?: StudySummary[] }>(API_BASE, token);
  return Array.isArray(data) ? data : (data.studies ?? []);
}

/**
 * Fetches and manages the list of studies for the studies page.
 *
 * @returns Study list state and a refetch callback.
 */
export function useStudiesData() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const items = await fetchStudies(token);
      setStudies(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load studies");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Background refresh: same fetch, but doesn't toggle `loading` so the list
  // doesn't flash to a loading state every poll — only the initial load and
  // explicit refetch() calls (e.g. after saving a study) show that.
  const silentRefetch = useCallback(async () => {
    if (!token) return;
    try {
      const items = await fetchStudies(token);
      setStudies(items);
      setError("");
    } catch {
      // Background poll failures stay silent — the visible error state is
      // reserved for the foreground fetch so a transient blip doesn't blank
      // an already-loaded list with an error banner.
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!token) return;

    const tick = () => {
      if (document.visibilityState === "visible") silentRefetch();
    };
    timerRef.current = setInterval(tick, REFRESH_MS);

    // Refresh immediately when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") silentRefetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, silentRefetch]);

  return { studies, loading, error, token, refetch };
}
