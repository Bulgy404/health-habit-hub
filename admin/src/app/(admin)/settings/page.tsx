"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const SETTINGS_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/settings";

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

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  const [cueCount, setCueCount] = useState("multi");
  const [cueSource, setCueSource] = useState("high_quality");
  const [reminderTime, setReminderTime] = useState("19:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch(SETTINGS_API, token)
      .then((data: Record<string, string>) => {
        if (data.default_cue_count) setCueCount(data.default_cue_count);
        if (data.default_cue_source) setCueSource(data.default_cue_source);
        if (data.default_reminder_time) setReminderTime(data.default_reminder_time);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await Promise.all([
        apiFetch(`${SETTINGS_API}/default_cue_count`, token, {
          method: "PUT",
          body: JSON.stringify({ value: cueCount }),
        }),
        apiFetch(`${SETTINGS_API}/default_cue_source`, token, {
          method: "PUT",
          body: JSON.stringify({ value: cueSource }),
        }),
        apiFetch(`${SETTINGS_API}/default_reminder_time`, token, {
          method: "PUT",
          body: JSON.stringify({ value: reminderTime }),
        }),
      ]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>System configuration and platform settings.</p>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Public Default Cue Config</p>
        <p className={styles.sectionDesc}>
          Configuration used for app-store users who join without a study code.
          Study participants override these with their condition-specific settings.
        </p>

        {loading ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : (
          <>
            {error && <div className={styles.errorMsg}>{error}</div>}
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue count</label>
                <select
                  className={styles.select}
                  value={cueCount}
                  onChange={(e) => { setCueCount(e.target.value); setSaved(false); }}
                >
                  <option value="single">Single cue</option>
                  <option value="multi">Multi-cue (recommended)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue source</label>
                <select
                  className={styles.select}
                  value={cueSource}
                  onChange={(e) => { setCueSource(e.target.value); setSaved(false); }}
                >
                  <option value="high_quality">High quality (recommended)</option>
                  <option value="low_quality">Low quality</option>
                  <option value="self_selected">Self-selected</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Default reminder time</label>
                <input
                  className={styles.input}
                  type="time"
                  value={reminderTime}
                  onChange={(e) => { setReminderTime(e.target.value); setSaved(false); }}
                />
              </div>
            </div>
            <div className={styles.footer}>
              {saved && <span className={styles.savedMsg}>Saved!</span>}
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
