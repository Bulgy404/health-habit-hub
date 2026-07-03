"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";

const ACTIVITY_TYPES_API = apiUrl("/admin/activity-types");

interface ActivityType {
  key: string;
  label_en: string;
  label_de?: string;
  isDefault: boolean;
}

/**
 * Manages the platform-wide catalog of activity types that study groups can
 * offer as behavior options. Activity types marked as "default" form the
 * pre-selected set when a study group has no explicit behavior restriction.
 * Public (non-study) users are unaffected — they enter their habit as free
 * text.
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
      <p className={styles.sectionTitle}>Catalog</p>
      <p className={styles.sectionDesc}>
        Platform-wide catalog of activity types that study participants can choose from when creating a habit.
        Activities marked as <strong>default</strong> are pre-selected for study groups without an explicit
        behavior restriction. Study groups can restrict or expand the list via their Cue Config.
        Public (non-study) users enter their habit as free text and do not use this catalog.
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

// ── Activity Types page ───────────────────────────────────────────────────────

/**
 * Manages the platform-wide activity-type catalog used by study cue configs.
 * Public app settings and study cue configuration have their own pages
 * (Public App and Studies).
 *
 * @returns The activity types management page.
 */
export default function ActivityTypesPage() {
  const { token } = useAdminGuard();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Activity Types</h1>
        <p className={styles.subtitle}>
          The behavior catalog offered to study participants via cue configs.
        </p>
      </div>

      <ActivityTypesSection token={token} />
    </div>
  );
}
