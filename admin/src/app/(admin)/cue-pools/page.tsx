"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

interface Cue {
  id: string;
  text: string;
  quality: "low" | "high";
  dimensions: { stability: number; salience: number; specificity: number };
  domain: string;
  language: string;
  createdAt: string | null;
}

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/cue-pools";

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

export default function CuePoolsPage() {
  const { data: session } = useSession();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [cues, setCues] = useState<Cue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterQuality, setFilterQuality] = useState("");
  const [filterLang, setFilterLang] = useState("");

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

  const fetchCues = useCallback(
    async (p: number) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(limit),
        });
        if (filterQuality) params.set("quality", filterQuality);
        if (filterLang) params.set("language", filterLang);
        const data = await apiFetch(`${API_BASE}?${params}`, token);
        setCues((data as { cues: Cue[] }).cues ?? []);
        setTotal((data as { total: number }).total ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load cues");
      } finally {
        setLoading(false);
      }
    },
    [token, filterQuality, filterLang]
  );

  useEffect(() => {
    setPage(1);
    fetchCues(1);
  }, [fetchCues]);

  async function handleCreate() {
    if (!newText.trim()) {
      setCreateError("Text is required.");
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
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
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
          <h1 className={styles.title}>Cue Pools</h1>
          <p className={styles.subtitle}>
            Manage pre-rated contextual cues for study conditions.
          </p>
        </div>
        <button
          className={styles.addButton}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "+ Add Cue"}
        </button>
      </div>

      {showForm && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>New cue</p>
          {createError && (
            <div className={styles.errorMsg}>{createError}</div>
          )}
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formFull}`}>
              <label className={styles.label}>Cue text *</label>
              <input
                className={styles.input}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="e.g. After dinner each evening"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Quality</label>
              <select
                className={styles.select}
                value={newQuality}
                onChange={(e) =>
                  setNewQuality(e.target.value as "high" | "low")
                }
              >
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Domain</label>
              <input
                className={styles.input}
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Language</label>
              <select
                className={styles.select}
                value={newLang}
                onChange={(e) => setNewLang(e.target.value)}
              >
                <option value="en">English</option>
                <option value="de">German</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Stability (1–5)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newStability}
                onChange={(e) => setNewStability(Number(e.target.value))}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Salience (1–5)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newSalience}
                onChange={(e) => setNewSalience(Number(e.target.value))}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Specificity (1–5)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={5}
                value={newSpecificity}
                onChange={(e) => setNewSpecificity(Number(e.target.value))}
              />
            </div>
          </div>
          <div className={styles.formFooter}>
            <button
              className={styles.saveBtn}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.filterRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Quality</label>
          <select
            className={styles.select}
            value={filterQuality}
            onChange={(e) => setFilterQuality(e.target.value)}
          >
            <option value="">All</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Language</label>
          <select
            className={styles.select}
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
          >
            <option value="">All</option>
            <option value="en">English</option>
            <option value="de">German</option>
          </select>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : cues.length === 0 ? (
        <div className={styles.emptyState}>
          No cues yet. Click &quot;+ Add Cue&quot; to create one.
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Text</th>
                  <th>Quality</th>
                  <th>Dimensions</th>
                  <th>Domain</th>
                  <th>Lang</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cues.map((cue) => (
                  <tr key={cue.id}>
                    <td>{cue.text}</td>
                    <td>
                      <span
                        className={`${styles.qualityBadge} ${
                          cue.quality === "high"
                            ? styles.qualityHigh
                            : styles.qualityLow
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
                        {deleting === cue.id ? "…" : "Delete"}
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
                ‹ Prev
              </button>
              <span className={styles.pageInfo}>
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                className={styles.pageBtn}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
