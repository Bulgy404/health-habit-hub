"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const SETTINGS_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/settings";

const ACTIVITY_TYPES_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/activity-types";

/**
 * Authenticated JSON fetch helper.
 *
 * @param url - The full URL to fetch.
 * @param token - The NextAuth session access token.
 * @param opts - Additional fetch options.
 * @returns The parsed JSON response body.
 * @throws {Error} If the response status is not 2xx.
 */
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

// ── Activity Types section ────────────────────────────────────────────────────

interface ActivityType {
  key: string;
  label_en: string;
  label_de?: string;
  isDefault: boolean;
}

/**
 * Manages the platform-wide catalog of activity types that appear as behavior
 * options when participants create a new habit. Activity types marked as
 * "default" are shown to public (non-study) users automatically.
 */
function ActivityTypesSection({ token }: { token: string }) {
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New-activity form fields
  const [newKey, setNewKey] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelDe, setNewLabelDe] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const fetchTypes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(ACTIVITY_TYPES_API, token);
      setTypes(data as ActivityType[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity types");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  async function handleToggleDefault(key: string, current: boolean) {
    try {
      await apiFetch(`${ACTIVITY_TYPES_API}/${encodeURIComponent(key)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: !current }),
      });
      setTypes((prev) =>
        prev.map((t) => (t.key === key ? { ...t, isDefault: !current } : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete activity type "${key}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`${ACTIVITY_TYPES_API}/${encodeURIComponent(key)}`, token, {
        method: "DELETE",
      });
      setTypes((prev) => prev.filter((t) => t.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleAdd() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const label_en = newLabelEn.trim();
    if (!key || !label_en) { setAddError("Key and English label are required."); return; }
    setAdding(true);
    setAddError("");
    try {
      const created = await apiFetch(ACTIVITY_TYPES_API, token, {
        method: "POST",
        body: JSON.stringify({ key, label_en, label_de: newLabelDe.trim() || undefined, isDefault: newIsDefault }),
      }) as ActivityType;
      setTypes((prev) => [...prev, created]);
      setNewKey(""); setNewLabelEn(""); setNewLabelDe(""); setNewIsDefault(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Activity Types</p>
      <p className={styles.sectionDesc}>
        Platform-wide catalog of activity types that participants can choose from when creating a habit.
        Activities marked as <strong>default</strong> are pre-selected for public (non-study) users.
        Study groups can restrict or expand this list via their Cue Config.
      </p>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : (
        <>
          <table className={styles.activityTable}>
            <thead>
              <tr>
                <th>Key</th>
                <th>English label</th>
                <th>German label</th>
                <th>Default</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.key}>
                  <td><span className={styles.activityKey}>{t.key}</span></td>
                  <td>{t.label_en}</td>
                  <td>{t.label_de || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                  <td>
                    <input
                      type="checkbox"
                      className={styles.defaultToggle}
                      checked={t.isDefault}
                      onChange={() => handleToggleDefault(t.key, t.isDefault)}
                      title="Toggle as platform default"
                    />
                  </td>
                  <td>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(t.key)}
                      title="Delete activity type"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {addError && <div className={styles.errorMsg}>{addError}</div>}

          <div className={styles.addActivityRow}>
            <div>
              <label className={styles.addFieldLabel}>Key</label>
              <input
                className={styles.input}
                placeholder="e.g. swimming"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
            <div>
              <label className={styles.addFieldLabel}>English label</label>
              <input
                className={styles.input}
                placeholder="Swimming"
                value={newLabelEn}
                onChange={(e) => setNewLabelEn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
            <div>
              <label className={styles.addFieldLabel}>German label (optional)</label>
              <input
                className={styles.input}
                placeholder="Schwimmen"
                value={newLabelDe}
                onChange={(e) => setNewLabelDe(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", paddingTop: "1.25rem" }}>
              <input
                type="checkbox"
                id="new-is-default"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
              />
              <label htmlFor="new-is-default" className={styles.addFieldLabel} style={{ margin: 0, cursor: "pointer" }}>Default</label>
            </div>
            <button
              className={styles.addBtn}
              onClick={handleAdd}
              disabled={adding}
              style={{ alignSelf: "flex-end" }}
            >
              {adding ? "Adding…" : "Add activity"}
            </button>
          </div>
          <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
            The key must be lowercase with underscores (e.g. <code>strength_training</code>). It is auto-normalised from what you type.
          </p>
        </>
      )}
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

/**
 * Displays and manages system configuration settings, including default cue
 * configuration for public app-store users.
 *
 * @returns The settings management page.
 */
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
                <span className={styles.hint}>Single: one cue per habit session. Multi: several cues presented together.</span>
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
                <span className={styles.hint}>How cues are selected for non-study users — from the pre-rated library or participant-chosen.</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Default reminder time</label>
                <input
                  className={styles.input}
                  type="time"
                  value={reminderTime}
                  onChange={(e) => { setReminderTime(e.target.value); setSaved(false); }}
                />
                <span className={styles.hint}>Time of day for the daily check-in push notification. Participants can override in their profile.</span>
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

      <ActivityTypesSection token={token} />
    </div>
  );
}
