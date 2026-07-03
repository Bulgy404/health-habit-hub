"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";

const APP_SETTINGS_API = apiUrl("/admin/app-settings");
const SETTINGS_API = apiUrl("/admin/settings");

// ── Features section ──────────────────────────────────────────────────────────

interface AppSettings {
  guidedHabitCreationEnabled: boolean;
  communityShareDefault: boolean;
}

/**
 * Feature toggles for the public app experience, backed by the
 * /admin/app-settings singleton.
 */
function FeaturesSection({ token }: { token: string }) {
  const [settings, setSettings] = useState<AppSettings>({
    guidedHabitCreationEnabled: true,
    communityShareDefault: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(APP_SETTINGS_API, token);
      setSettings(data as AppSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<AppSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Features</p>
      <p className={styles.sectionDesc}>
        Which features are active for public users.
      </p>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : (
        <>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.guidedHabitCreationEnabled}
              onChange={(e) =>
                update({ guidedHabitCreationEnabled: e.target.checked })
              }
            />
            <span>Guided implementation intention wizard</span>
          </label>
          <p className={styles.toggleHint}>
            When enabled, public users are taken through a step-by-step wizard
            (habit → cues → LLM stitch → confirm → reminder). Habit and cues
            are always free text for public users; disabling this only skips
            the LLM stitching step.
          </p>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.communityShareDefault}
              onChange={(e) =>
                update({ communityShareDefault: e.target.checked })
              }
            />
            <span>Community sharing opt-in shown by default</span>
          </label>
          <p className={styles.toggleHint}>
            When enabled, the community sharing toggle appears at the end of
            habit creation and is pre-selected.
          </p>

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
  );
}

// ── Defaults section ──────────────────────────────────────────────────────────

/**
 * Non-study defaults for the public app, backed by the
 * default_reminder_time key in /admin/settings.
 *
 * Public users enter their habit and cues as free text, so there is no cue
 * or behavior configuration here — that exists only per study group
 * (Studies → Cue Config).
 */
function DefaultsSection({ token }: { token: string }) {
  const [reminderTime, setReminderTime] = useState("19:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch(SETTINGS_API, token)
      .then((data: Record<string, string>) => {
        if (data.default_reminder_time) setReminderTime(data.default_reminder_time);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await apiFetch(`${SETTINGS_API}/default_reminder_time`, token, {
        method: "PUT",
        body: JSON.stringify({ value: reminderTime }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Defaults</p>
      <p className={styles.sectionDesc}>
        Public users create their habits with free-text entry — cue and
        behavior configuration exists only per study group (Studies → Cue
        Config).
      </p>

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : (
        <>
          {error && <div className={styles.errorMsg}>{error}</div>}
          <div className={styles.formGroup} style={{ maxWidth: "16rem" }}>
            <label className={styles.label}>Default reminder time</label>
            <input
              className={styles.input}
              type="time"
              value={reminderTime}
              onChange={(e) => {
                setReminderTime(e.target.value);
                setSaved(false);
              }}
            />
            <span className={styles.hint}>
              Time of day for the daily check-in push notification. Users can
              override in their profile.
            </span>
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Unified admin page for the public (no-study-code) app experience:
 * feature toggles and non-study defaults.
 */
export default function DefaultAppPage() {
  const { token } = useAdminGuard();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Public App</h1>
        <p className={styles.subtitle}>
          Default experience for users who open the app without a study code.
        </p>
      </div>

      <FeaturesSection token={token} />
      <DefaultsSection token={token} />
    </div>
  );
}
