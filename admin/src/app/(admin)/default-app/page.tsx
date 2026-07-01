"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const APP_SETTINGS_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/app-settings";

async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return res.json();
}

interface AppSettings {
  guidedHabitCreationEnabled: boolean;
  communityShareDefault: boolean;
}

/**
 * Admin page for configuring the public / default app experience.
 *
 * Public users (no study code) get the guided implementation intention wizard.
 * These settings control which features are active for them.
 */
export default function DefaultAppPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = (session as { accessToken?: string })?.accessToken ?? "";

  const [settings, setSettings] = useState<AppSettings>({
    guidedHabitCreationEnabled: true,
    communityShareDefault: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(APP_SETTINGS_API, token);
      setSettings(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await apiFetch(APP_SETTINGS_API, token, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Public App Settings</h1>
      <p className={styles.subtitle}>
        Configure the default experience for users who open the app without a
        study code.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Habit Creation</h2>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.guidedHabitCreationEnabled}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                guidedHabitCreationEnabled: e.target.checked,
              }))
            }
          />
          <span>Guided implementation intention wizard</span>
        </label>
        <p className={styles.hint}>
          When enabled, public users are taken through a step-by-step wizard
          (action → cues → LLM stitch → confirm → reminder) instead of a free
          text entry.
        </p>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.communityShareDefault}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                communityShareDefault: e.target.checked,
              }))
            }
          />
          <span>Community sharing opt-in shown by default</span>
        </label>
        <p className={styles.hint}>
          When enabled, the community sharing toggle appears at the end of habit
          creation and is pre-selected.
        </p>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className={styles.savedBadge}>Saved</span>}
      </div>
    </div>
  );
}
