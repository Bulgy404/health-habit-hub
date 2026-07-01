"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "./api";
import type { ActivityTypeEntry } from "@/components/cue-config-form";

const ACTIVITY_TYPES_API = apiUrl("/admin/activity-types");

// Hardcoded fallback — used only when the activity-types API is unreachable.
const FALLBACK_ACTIVITY_TYPES: ActivityTypeEntry[] = [
  { key: "walking", label_en: "Walking", isDefault: true },
  { key: "light_jogging", label_en: "Light jogging", isDefault: true },
  { key: "cycling", label_en: "Cycling", isDefault: true },
  { key: "structured_calisthenics", label_en: "Structured calisthenics", isDefault: true },
  { key: "yoga", label_en: "Yoga", isDefault: true },
];

/**
 * Load the platform activity-type catalog for cue-config forms.
 *
 * @param token - The NextAuth session access token.
 * @returns The catalog (fallback list on API failure) and a loading flag.
 */
export function useActivityTypes(token: string): {
  activityTypes: ActivityTypeEntry[];
  loading: boolean;
} {
  const [activityTypes, setActivityTypes] = useState<ActivityTypeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch(ACTIVITY_TYPES_API, token)
      .then((data) => {
        if (!cancelled) setActivityTypes(data as ActivityTypeEntry[]);
      })
      .catch(() => {
        if (!cancelled) setActivityTypes(FALLBACK_ACTIVITY_TYPES);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { activityTypes, loading };
}
