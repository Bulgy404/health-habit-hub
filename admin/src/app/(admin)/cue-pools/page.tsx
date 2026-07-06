"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";
import { useCuePoolsData } from "./useCuePoolsData";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/admin/cue-pools";

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
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Displays and manages pre-rated contextual cues for study conditions.
 * Supports creating, filtering, importing via CSV, and deleting cues.
 *
 * @returns The cue pools management page.
 */
export default function CuePoolsPage() {
  const { data: session } = useSession();
  const t = useTranslations("cuePools");
  const tc = useTranslations("common");
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [page, setPage] = useState(1);
  const [filterQuality, setFilterQuality] = useState("");
  const [filterLang, setFilterLang] = useState("");

  const {
    cues,
    total,
    loading,
    error,
    limit,
    refetch: fetchCues,
  } = useCuePoolsData(token, page, filterQuality, filterLang);

  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newQuality, setNewQuality] = useState<"high" | "low">("high");
  const [newDomain, setNewDomain] = useState("physical_activity");
  const [newLang, setNewLang] = useState("en");
  const [newStability, setNewStability] = useState(3);
  const [newSalience, setNewSalience] = useState(3);
  const [newSpecificity, setNewSpecificity] = useState(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [deleting, setDeleting] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number } | null>(
    null
  );
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate() {
    if (!newText.trim()) {
      setCreateError(t("textRequired"));
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await apiFetch(API_BASE, token, {
        method: "POST",
        body: JSON.stringify({
          text: newText.trim(),
          quality: newQuality,
          domain: newDomain,
          language: newLang,
          dimensions: {
            stability: newStability,
            salience: newSalience,
            specificity: newSpecificity,
          },
        }),
      });
      setNewText("");
      setShowForm(false);
      await fetchCues(1);
      setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleImportCsv(file: File) {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.trim().split("\n").filter(Boolean);
      if (lines.length < 2) {
        setImportError(t("csvHeaderError"));
        setImporting(false);
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const required = [
        "text",
        "quality",
        "stability",
        "salience",
        "specificity",
        "domain",
        "language",
      ];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        setImportError(t("missingColumns", { columns: missing.join(", ") }));
        setImporting(false);
        return;
      }
      const cues = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });
      const data = await apiFetch(
        (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
          "/admin/cue-pools/import",
        token,
        { method: "POST", body: JSON.stringify({ cues }) }
      );
      setImportResult(data as { inserted: number; skipped: number });
      await fetchCues(1);
      setPage(1);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("importFailed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await apiFetch(`${API_BASE}/${id}`, token, { method: "DELETE" });
      await fetchCues(page);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportCsv(file);
            }}
          />
          <button
            className={styles.importButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? t("importing") : t("importCsv")}
          </button>
          <button className={styles.addButton} onClick={() => setShowForm((v) => !v)}>
            {showForm ? tc("cancel") : t("addCue")}
          </button>
        </div>
      </div>

      {showForm && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>{t("newCueTitle")}</p>
          {createError && <div className={styles.errorMsg}>{createError}</div>}
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formFull}`}>
              <label className={styles.label}>{t("cueTextLabel")}</label>
              <input
                className={styles.input}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={t("cueTextPlaceholder")}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("qualityLabel")}</label>
              <select
                className={styles.select}
                value={newQuality}
                onChange={(e) => setNewQuality(e.target.value as "high" | "low")}
              >
                <option value="high">{t("qualityHigh")}</option>
                <option value="low">{t("qualityLow")}</option>
              </select>
              <span className={styles.hint}>{t("qualityHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("domainLabel")}</label>
              <input
                className={styles.input}
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
              <span className={styles.hint}>{t("domainHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("languageLabel")}</label>
              <select
                className={styles.select}
                value={newLang}
                onChange={(e) => setNewLang(e.target.value)}
              >
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="fr">French</option>
                <option value="nl">Dutch</option>
              </select>
              <span className={styles.hint}>{t("languageHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("stabilityLabel")}</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newStability}
                onChange={(e) => setNewStability(Number(e.target.value))}
              />
              <span className={styles.hint}>{t("stabilityHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("salienceLabel")}</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newSalience}
                onChange={(e) => setNewSalience(Number(e.target.value))}
              />
              <span className={styles.hint}>{t("salienceHint")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("specificityLabel")}</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newSpecificity}
                onChange={(e) => setNewSpecificity(Number(e.target.value))}
              />
              <span className={styles.hint}>{t("specificityHint")}</span>
            </div>
          </div>
          <div className={styles.formFooter}>
            <button className={styles.saveBtn} onClick={handleCreate} disabled={creating}>
              {creating ? t("creating") : t("create")}
            </button>
          </div>
        </div>
      )}

      <div className={styles.filterRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t("qualityLabel")}</label>
          <select
            className={styles.select}
            value={filterQuality}
            onChange={(e) => {
              setFilterQuality(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("filterAll")}</option>
            <option value="high">{t("qualityHigh")}</option>
            <option value="low">{t("qualityLow")}</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>{t("languageLabel")}</label>
          <select
            className={styles.select}
            value={filterLang}
            onChange={(e) => {
              setFilterLang(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("filterAll")}</option>
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="fr">French</option>
            <option value="nl">Dutch</option>
          </select>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {importResult && (
        <div className={styles.importResult}>
          {t("importedCues", { count: importResult.inserted })}
          {importResult.skipped > 0 ? t("importedSkipped", { count: importResult.skipped }) : ""}.
        </div>
      )}
      {importError && <div className={styles.errorMsg}>{importError}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
      ) : cues.length === 0 ? (
        <div className={styles.emptyState}>{t("emptyState", { addCue: t("addCue") })}</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("textHeader")}</th>
                  <th>{t("qualityLabel")}</th>
                  <th>{t("dimensionsHeader")}</th>
                  <th>{t("domainLabel")}</th>
                  <th>{t("langHeader")}</th>
                  <th>{t("actionHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {cues.map((cue) => (
                  <tr key={cue.id}>
                    <td>{cue.text}</td>
                    <td>
                      <span
                        className={`${styles.qualityBadge} ${
                          cue.quality === "high" ? styles.qualityHigh : styles.qualityLow
                        }`}
                      >
                        {cue.quality}
                      </span>
                    </td>
                    <td>
                      <span className={styles.dimBadge}>
                        S:{cue.dimensions.stability} Sa:
                        {cue.dimensions.salience} Sp:{cue.dimensions.specificity}
                      </span>
                    </td>
                    <td>{cue.domain}</td>
                    <td>{cue.language}</td>
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(cue.id)}
                        disabled={deleting === cue.id}
                      >
                        {deleting === cue.id ? "…" : tc("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("prev")}
              </button>
              <span className={styles.pageInfo}>{t("pageInfo", { page, totalPages, total })}</span>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
