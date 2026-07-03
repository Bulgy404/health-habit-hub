"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import styles from "./admin-page.module.css";

const ACTIVITY_TYPES_API = apiUrl("/admin/activity-types");

interface ActivityType {
  key: string;
  label_en: string;
  label_de?: string;
  isDefault: boolean;
}

/**
 * Manage the platform-wide catalog of activity types that study groups can offer
 * as behavior options (via each group's Cue Config → Allowed behaviors). The
 * catalog is shared across all studies; public/free-entry users are unaffected.
 *
 * Rendered inside the study settings modal (Cue Config tab), next to where the
 * allowed behaviors are chosen.
 */
export function ActivityTypesManager({ token }: { token: string }) {
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newKey, setNewKey] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelDe, setNewLabelDe] = useState("");
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchTypes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(ACTIVITY_TYPES_API, token);
      setTypes(Array.isArray(data) ? (data as ActivityType[]) : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity types");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  async function toggleDefault(key: string, current: boolean) {
    try {
      await apiFetch(`${ACTIVITY_TYPES_API}/${encodeURIComponent(key)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: !current }),
      });
      setTypes((prev) => prev.map((t) => (t.key === key ? { ...t, isDefault: !current } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove(key: string) {
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

  async function add() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const label_en = newLabelEn.trim();
    if (!key || !label_en) {
      setError("Key and English label are required.");
      return;
    }
    setAdding(true);
    try {
      const created = (await apiFetch(ACTIVITY_TYPES_API, token, {
        method: "POST",
        body: JSON.stringify({
          key,
          label_en,
          label_de: newLabelDe.trim() || undefined,
          isDefault: newIsDefault,
        }),
      })) as ActivityType;
      setTypes((prev) => [...prev, created]);
      setNewKey("");
      setNewLabelEn("");
      setNewLabelDe("");
      setNewIsDefault(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <p className={styles.sectionTitle}>Activity type catalog (shared across studies)</p>
      <p className={styles.muted} style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        Behaviors participants can pick from when a group restricts its allowed
        behaviors below. Defaults are pre-selected for groups with no explicit
        restriction. Free-entry (public) users don&apos;t use this catalog.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>English</th>
                  <th>German</th>
                  <th>Default</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.key}>
                    <td><span className={styles.code}>{t.key}</span></td>
                    <td>{t.label_en}</td>
                    <td>{t.label_de || <span className={styles.muted}>—</span>}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={t.isDefault}
                        onChange={() => toggleDefault(t.key, t.isDefault)}
                        title="Toggle as platform default"
                      />
                    </td>
                    <td>
                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => remove(t.key)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td colSpan={5} className={styles.muted} style={{ textAlign: "center", padding: "1.5rem" }}>
                      No activity types yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.filters} style={{ marginTop: "0.75rem" }}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Key</span>
              <input className={styles.input} placeholder="e.g. swimming" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>English</span>
              <input className={styles.input} placeholder="Swimming" value={newLabelEn} onChange={(e) => setNewLabelEn(e.target.value)} />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>German (optional)</span>
              <input className={styles.input} placeholder="Schwimmen" value={newLabelDe} onChange={(e) => setNewLabelDe(e.target.value)} />
            </div>
            <label className={styles.filterGroup} style={{ flexDirection: "row", alignItems: "center", gap: "0.35rem" }}>
              <input type="checkbox" checked={newIsDefault} onChange={(e) => setNewIsDefault(e.target.checked)} />
              <span className={styles.filterLabel} style={{ margin: 0 }}>Default</span>
            </label>
            <button className={styles.addButton} onClick={add} disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
