"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import styles from "@/components/admin-page.module.css";

interface KbFile {
  filename: string;
  citation: string;
  has_reference: boolean;
}

/**
 * Which knowledge-base papers this study's recommender may draw on.
 *
 * The distinction that matters here is between "everything" and "nothing", and
 * it is easy to build a UI that cannot express the first. A study with no
 * explicit selection draws on every indexed paper — which is what the general
 * study wants and what every study did before this existed — and that is stored
 * as `null`, not as a list that happens to contain everything. Were it a list,
 * a paper uploaded next month would silently not reach any existing study.
 *
 * An empty selection is a real, different instruction: draw on nothing.
 */
export function KnowledgeScopePanel({
  studyId,
  token,
  initialFiles,
  isDefaultStudy,
}: {
  studyId: string;
  token: string;
  initialFiles: string[] | null;
  isDefaultStudy: boolean;
}) {
  const t = useTranslations("studies");
  const [files, setFiles] = useState<KbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeAll, setScopeAll] = useState(initialFiles === null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialFiles ?? []),
  );
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<KbFile[]>(apiUrl("/kb"), token);
      setFiles(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("kbScope.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.citation.toLowerCase().includes(q),
    );
  }, [files, filter]);

  function toggle(filename: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(apiUrl(`/admin/studies/${studyId}`), token, {
        method: "PUT",
        body: JSON.stringify({
          knowledgeBaseFiles: scopeAll ? null : [...selected],
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("kbScope.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("kbScope.title")}</h3>
      <p className={styles.muted}>
        {isDefaultStudy ? t("kbScope.defaultStudyHint") : t("kbScope.hint")}
      </p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>
          <input
            type="radio"
            name={`kb-scope-${studyId}`}
            checked={scopeAll}
            onChange={() => {
              setScopeAll(true);
              setSaved(false);
            }}
          />{" "}
          {t("kbScope.useAll")}
        </label>
        <label className={styles.filterLabel}>
          <input
            type="radio"
            name={`kb-scope-${studyId}`}
            checked={!scopeAll}
            onChange={() => {
              setScopeAll(false);
              setSaved(false);
            }}
          />{" "}
          {t("kbScope.usePicked")}
        </label>
      </div>

      {!scopeAll && (
        <>
          <div className={styles.filters}>
            <input
              className={styles.input}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("kbScope.filterPlaceholder")}
              aria-label={t("kbScope.filterLabel")}
            />
            <span className={styles.muted}>
              {t("kbScope.selectedCount", {
                selected: selected.size,
                total: files.length,
              })}
            </span>
          </div>

          {loading ? (
            <p className={styles.muted}>{t("kbScope.loading")}</p>
          ) : files.length === 0 ? (
            <p className={styles.muted}>{t("kbScope.empty")}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f.filename}>
                      <td>
                        <label className={styles.filterLabel}>
                          <input
                            type="checkbox"
                            checked={selected.has(f.filename)}
                            onChange={() => toggle(f.filename)}
                          />{" "}
                          {f.citation || f.filename}
                        </label>
                        <div className={styles.code}>{f.filename}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && selected.size === 0 && (
            // Saving this is allowed — it is a coherent instruction — but it is
            // almost always a half-finished selection rather than an intent.
            <p className={styles.muted}>{t("kbScope.noneWarning")}</p>
          )}
        </>
      )}

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? t("kbScope.saving") : t("kbScope.save")}
        </button>
        {saved && <span className={styles.muted}>{t("kbScope.saved")}</span>}
      </div>
    </section>
  );
}
