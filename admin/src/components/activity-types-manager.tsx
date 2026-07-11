"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import styles from "./admin-page.module.css";

const ACTIVITY_TYPES_API = apiUrl("/admin/activity-types");

interface ActivityType {
  key: string;
  label_en: string;
  label_de?: string;
  label_fr?: string;
  label_nl?: string;
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
  const t = useTranslations("activityTypesManager");
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newKey, setNewKey] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelDe, setNewLabelDe] = useState("");
  const [newLabelFr, setNewLabelFr] = useState("");
  const [newLabelNl, setNewLabelNl] = useState("");
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
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  async function toggleDefault(key: string, current: boolean) {
    try {
      await apiFetch(`${ACTIVITY_TYPES_API}/${encodeURIComponent(key)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: !current }),
      });
      setTypes((prev) =>
        prev.map((item) => (item.key === key ? { ...item, isDefault: !current } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("updateFailed"));
    }
  }

  async function remove(key: string) {
    if (!confirm(t("confirmDelete", { key }))) return;
    try {
      await apiFetch(`${ACTIVITY_TYPES_API}/${encodeURIComponent(key)}`, token, {
        method: "DELETE",
      });
      setTypes((prev) => prev.filter((item) => item.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  async function add() {
    const key = newKey
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const label_en = newLabelEn.trim();
    if (!key || !label_en) {
      setError(t("keyAndLabelRequired"));
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
          label_fr: newLabelFr.trim() || undefined,
          label_nl: newLabelNl.trim() || undefined,
          isDefault: newIsDefault,
        }),
      })) as ActivityType;
      setTypes((prev) => [...prev, created]);
      setNewKey("");
      setNewLabelEn("");
      setNewLabelDe("");
      setNewLabelFr("");
      setNewLabelNl("");
      setNewIsDefault(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addFailed"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <p className={styles.sectionTitle}>{t("title")}</p>
      <p className={styles.muted} style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        {t("description")}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p className={styles.muted}>{t("loadingEllipsis")}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("key")}</th>
                  <th>{t("english")}</th>
                  <th>{t("german")}</th>
                  <th>{t("french")}</th>
                  <th>{t("dutch")}</th>
                  <th>{t("default")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {types.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <span className={styles.code}>{item.key}</span>
                    </td>
                    <td>{item.label_en}</td>
                    <td>{item.label_de || <span className={styles.muted}>—</span>}</td>
                    <td>{item.label_fr || <span className={styles.muted}>—</span>}</td>
                    <td>{item.label_nl || <span className={styles.muted}>—</span>}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.isDefault}
                        onChange={() => toggleDefault(item.key, item.isDefault)}
                        title={t("toggleDefaultTitle")}
                      />
                    </td>
                    <td>
                      <button
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        onClick={() => remove(item.key)}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className={styles.muted}
                      style={{ textAlign: "center", padding: "1.5rem" }}
                    >
                      {t("noActivityTypes")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.filters} style={{ marginTop: "0.75rem" }}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t("key")}</span>
              <input
                className={styles.input}
                placeholder={t("keyPlaceholder")}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t("english")}</span>
              <input
                className={styles.input}
                placeholder="Swimming"
                value={newLabelEn}
                onChange={(e) => setNewLabelEn(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t("germanOptional")}</span>
              <input
                className={styles.input}
                placeholder="Schwimmen"
                value={newLabelDe}
                onChange={(e) => setNewLabelDe(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t("frenchOptional")}</span>
              <input
                className={styles.input}
                placeholder="Natation"
                value={newLabelFr}
                onChange={(e) => setNewLabelFr(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t("dutchOptional")}</span>
              <input
                className={styles.input}
                placeholder="Zwemmen"
                value={newLabelNl}
                onChange={(e) => setNewLabelNl(e.target.value)}
              />
            </div>
            <label
              className={styles.filterGroup}
              style={{ flexDirection: "row", alignItems: "center", gap: "0.35rem" }}
            >
              <input
                type="checkbox"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
              />
              <span className={styles.filterLabel} style={{ margin: 0 }}>
                {t("default")}
              </span>
            </label>
            <button className={styles.addButton} onClick={add} disabled={adding}>
              {adding ? t("addingEllipsis") : t("add")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
