"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";

import { apiFetch, apiUrl } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";

const ACTIVITY_TYPES_API = apiUrl("/admin/activity-types");

interface ActivityType {
  key: string;
  label_en: string;
  label_de?: string;
  label_ja?: string;
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
  const t = useTranslations("settings");
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New-activity form fields
  const [newKey, setNewKey] = useState("");
  const [newLabelEn, setNewLabelEn] = useState("");
  const [newLabelDe, setNewLabelDe] = useState("");
  const [newLabelJa, setNewLabelJa] = useState("");
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
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  async function handleToggleDefault(key: string, current: boolean) {
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

  async function handleDelete(key: string) {
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

  async function handleAdd() {
    const key = newKey
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const label_en = newLabelEn.trim();
    if (!key || !label_en) {
      setAddError(t("keyAndLabelRequired"));
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      const created = (await apiFetch(ACTIVITY_TYPES_API, token, {
        method: "POST",
        body: JSON.stringify({
          key,
          label_en,
          label_de: newLabelDe.trim() || undefined,
          label_ja: newLabelJa.trim() || undefined,
          isDefault: newIsDefault,
        }),
      })) as ActivityType;
      setTypes((prev) => [...prev, created]);
      setNewKey("");
      setNewLabelEn("");
      setNewLabelDe("");
      setNewLabelJa("");
      setNewIsDefault(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t("addFailed"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{t("catalog")}</p>
      <p className={styles.sectionDesc}>
        {t.rich("catalogDesc", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>{t("loadingEllipsis")}</div>
      ) : (
        <>
          <table className={styles.activityTable}>
            <thead>
              <tr>
                <th>{t("key")}</th>
                <th>{t("englishLabel")}</th>
                <th>{t("germanLabel")}</th>
                <th>{t("japaneseLabel")}</th>
                <th>{t("default")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {types.map((item) => (
                <tr key={item.key}>
                  <td>
                    <span className={styles.activityKey}>{item.key}</span>
                  </td>
                  <td>{item.label_en}</td>
                  <td>
                    {item.label_de || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                  </td>
                  <td>
                    {item.label_ja || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      className={styles.defaultToggle}
                      checked={item.isDefault}
                      onChange={() => handleToggleDefault(item.key, item.isDefault)}
                      title={t("toggleDefaultTitle")}
                    />
                  </td>
                  <td>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(item.key)}
                      title={t("deleteTitle")}
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
              <label className={styles.addFieldLabel}>{t("key")}</label>
              <input
                className={styles.input}
                placeholder={t("keyPlaceholder")}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div>
              <label className={styles.addFieldLabel}>{t("englishLabel")}</label>
              <input
                className={styles.input}
                placeholder="Swimming"
                value={newLabelEn}
                onChange={(e) => setNewLabelEn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div>
              <label className={styles.addFieldLabel}>{t("germanLabelOptional")}</label>
              <input
                className={styles.input}
                placeholder="Schwimmen"
                value={newLabelDe}
                onChange={(e) => setNewLabelDe(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div>
              <label className={styles.addFieldLabel}>{t("japaneseLabelOptional")}</label>
              <input
                className={styles.input}
                placeholder="水泳"
                value={newLabelJa}
                onChange={(e) => setNewLabelJa(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                paddingTop: "1.25rem",
              }}
            >
              <input
                type="checkbox"
                id="new-is-default"
                checked={newIsDefault}
                onChange={(e) => setNewIsDefault(e.target.checked)}
              />
              <label
                htmlFor="new-is-default"
                className={styles.addFieldLabel}
                style={{ margin: 0, cursor: "pointer" }}
              >
                {t("default")}
              </label>
            </div>
            <button
              className={styles.addBtn}
              onClick={handleAdd}
              disabled={adding}
              style={{ alignSelf: "flex-end" }}
            >
              {adding ? t("addingEllipsis") : t("addActivity")}
            </button>
          </div>
          <p className={styles.hint} style={{ marginTop: "0.5rem" }}>
            {t.rich("keyHint", { code: (chunks) => <code>{chunks}</code> })}
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
  const t = useTranslations("settings");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </div>

      <ActivityTypesSection token={token} />
    </div>
  );
}
