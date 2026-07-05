"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("defaultApp.features");
  const tc = useTranslations("common");
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
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

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
      setError(err instanceof Error ? err.message : t("saveFailed"));
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
      <p className={styles.sectionTitle}>{t("sectionTitle")}</p>
      <p className={styles.sectionDesc}>{t("sectionDesc")}</p>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : (
        <>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.guidedHabitCreationEnabled}
              onChange={(e) => update({ guidedHabitCreationEnabled: e.target.checked })}
            />
            <span>{t("guidedWizardLabel")}</span>
          </label>
          <p className={styles.toggleHint}>{t("guidedWizardHint")}</p>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.communityShareDefault}
              onChange={(e) => update({ communityShareDefault: e.target.checked })}
            />
            <span>{t("communitySharingLabel")}</span>
          </label>
          <p className={styles.toggleHint}>{t("communitySharingHint")}</p>

          <div className={styles.footer}>
            {saved && <span className={styles.savedMsg}>{t("saved")}</span>}
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? tc("saving") : t("saveChanges")}
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
  const t = useTranslations("defaultApp.defaults");
  const tc = useTranslations("common");
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
        setError(err instanceof Error ? err.message : t("loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

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
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{t("sectionTitle")}</p>
      <p className={styles.sectionDesc}>{t("sectionDesc")}</p>

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : (
        <>
          {error && <div className={styles.errorMsg}>{error}</div>}
          <div className={styles.formGroup} style={{ maxWidth: "16rem" }}>
            <label className={styles.label}>{t("reminderTimeLabel")}</label>
            <input
              className={styles.input}
              type="time"
              value={reminderTime}
              onChange={(e) => {
                setReminderTime(e.target.value);
                setSaved(false);
              }}
            />
            <span className={styles.hint}>{t("reminderTimeHint")}</span>
          </div>

          <div className={styles.footer}>
            {saved && <span className={styles.savedMsg}>{t("saved")}</span>}
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? tc("saving") : t("saveChanges")}
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
  const t = useTranslations("defaultApp");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </div>

      <FeaturesSection token={token} />
      <DefaultsSection token={token} />
    </div>
  );
}
