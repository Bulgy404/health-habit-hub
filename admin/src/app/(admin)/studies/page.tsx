"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

import { useStudiesData } from "./useStudiesData";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyGroup {
  id: string;
  label: string;
  index: number;
  allocationWeight?: number;
  cueConfig?: CueConfig | null;
}

interface CueConfig {
  cueCount: "single" | "multi";
  cueSource: "low_quality" | "high_quality" | "self_selected";
  cuePoolId: string | null;
  behaviorOptions: string[];
  maxHabits: number | null;
}

interface StudySummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  groups: StudyGroup[];
  questionnaires: string[];
  participantCount: number;
  createdAt: string | null;
}

interface QuestionnaireSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  isLibrary: boolean;
  active: boolean;
}

interface StudyCode {
  code: string;
  groupId: string | null; // null = study-level code, group assigned at redemption
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  createdAt: string | null;
}

interface ScheduledNotification {
  id: string;
  studyId: string;
  targetIds: string[];
  targetType: string;
  title: string;
  body: string;
  scheduledFor: string;
  status: string;
}

interface SentNotification {
  id: string;
  title: string;
  body: string;
  targetType: string;
  targetIds: string[];
  sentAt: string | null;
  recipientCount: number | null;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/studies";

const QUESTIONNAIRES_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/questionnaires";

const NOTIFICATIONS_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/notifications";

const BEHAVIOR_OPTIONS = [
  { key: "walking", label: "Walking" },
  { key: "light_jogging", label: "Light jogging" },
  { key: "cycling", label: "Cycling" },
  { key: "structured_calisthenics", label: "Structured calisthenics" },
  { key: "yoga", label: "Yoga" },
];

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

// ── Questionnaires tab ────────────────────────────────────────────────────────

function QuestionnairesTab({
  study,
  token,
  onSaved,
}: {
  study: StudySummary;
  token: string;
  onSaved: () => void;
}) {
  const [allQuestionnaires, setAllQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(study.questionnaires ?? [])
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    apiFetch(QUESTIONNAIRES_API, token)
      .then((data) => {
        if (!cancelled) {
          setAllQuestionnaires(
            Array.isArray(data) ? (data as QuestionnaireSummary[]) : []
          );
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load questionnaires");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await apiFetch(`${API_BASE}/${study.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ questionnaires: Array.from(selected) }),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const library = allQuestionnaires.filter((q) => q.isLibrary);
  const custom = allQuestionnaires.filter((q) => !q.isLibrary);

  return (
    <div className={styles.questionnairesTab}>
      {loadError && <div className={styles.errorMsg}>{loadError}</div>}
      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : allQuestionnaires.length === 0 ? (
        <div className={styles.emptyState}>
          No questionnaires available. Create some in the Questionnaires section.
        </div>
      ) : (
        <>
          {library.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>Library questionnaires</p>
              <div className={styles.qList}>
                {library.map((q) => (
                  <label key={q.id} className={styles.qItem}>
                    <input
                      type="checkbox"
                      className={styles.qCheckbox}
                      checked={selected.has(q.id)}
                      onChange={() => toggleId(q.id)}
                    />
                    <span className={styles.qTitle}>{q.title}</span>
                    {!q.active && (
                      <span className={styles.qInactive}>inactive</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          {custom.length > 0 && (
            <div className={styles.qSection}>
              <p className={styles.qSectionTitle}>Custom questionnaires</p>
              <div className={styles.qList}>
                {custom.map((q) => (
                  <label key={q.id} className={styles.qItem}>
                    <input
                      type="checkbox"
                      className={styles.qCheckbox}
                      checked={selected.has(q.id)}
                      onChange={() => toggleId(q.id)}
                    />
                    <span className={styles.qTitle}>{q.title}</span>
                    {!q.active && (
                      <span className={styles.qInactive}>inactive</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          {saveError && <div className={styles.errorMsg}>{saveError}</div>}
          <div className={styles.qFooter}>
            {saved && (
              <span className={styles.savedMsg}>Saved!</span>
            )}
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Codes tab ─────────────────────────────────────────────────────────────────

function CodesTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  // ── Codes list ───────────────────────────────────────────────────────────
  const [codes, setCodes] = useState<StudyCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  // ── Allocation weights (slider) ──────────────────────────────────────────
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(study.groups.map((g) => [g.id, g.allocationWeight ?? 1]))
  );
  const [savingAlloc, setSavingAlloc] = useState(false);
  const [allocSaved, setAllocSaved] = useState(false);
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;

  // ── Study-level code generation (primary) ────────────────────────────────
  const [studyCount, setStudyCount] = useState(10);
  const [studyMaxRed, setStudyMaxRed] = useState("");
  const [studyExpiry, setStudyExpiry] = useState("");
  const [studyGenerating, setStudyGenerating] = useState(false);
  const [studyGenError, setStudyGenError] = useState("");
  const [studyGenCodes, setStudyGenCodes] = useState<string[]>([]);
  const [studyCopied, setStudyCopied] = useState(false);

  // ── Targeted group codes (secondary, collapsible) ────────────────────────
  const [targetOpen, setTargetOpen] = useState(false);
  const [genGroupId, setGenGroupId] = useState(study.groups[0]?.id ?? "");
  const [genCount, setGenCount] = useState(1);
  const [genMaxRed, setGenMaxRed] = useState("");
  const [genExpiry, setGenExpiry] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const fetchCodes = useCallback(
    async (p: number) => {
      setLoadingCodes(true);
      setCodesError("");
      try {
        const data = await apiFetch(
          `${API_BASE}/${study.id}/codes?page=${p}&limit=${limit}`,
          token
        );
        setCodes((data as { codes: StudyCode[] }).codes ?? []);
        setTotal((data as { total: number }).total ?? 0);
      } catch (err) {
        setCodesError(err instanceof Error ? err.message : "Failed to load codes");
      } finally {
        setLoadingCodes(false);
      }
    },
    [study.id, token]
  );

  useEffect(() => {
    fetchCodes(page);
  }, [fetchCodes, page]);

  function groupLabel(groupId: string | null): string {
    if (!groupId) return "Auto-assigned";
    const g = study.groups.find((grp) => grp.id === groupId);
    return g ? g.label || `Group ${g.index}` : groupId;
  }

  // ── Allocation save ──────────────────────────────────────────────────────
  async function handleSaveAllocation() {
    setSavingAlloc(true);
    try {
      await apiFetch(`${API_BASE}/${study.id}/allocation`, token, {
        method: "PATCH",
        body: JSON.stringify({
          weights: study.groups.map((g) => ({
            groupId: g.id,
            weight: weights[g.id] ?? 1,
          })),
        }),
      });
      setAllocSaved(true);
      setTimeout(() => setAllocSaved(false), 2000);
    } catch {
      // ignore — allocation save is best-effort in the UI
    } finally {
      setSavingAlloc(false);
    }
  }

  // ── Study-level code generation ──────────────────────────────────────────
  async function handleStudyGenerate() {
    setStudyGenerating(true);
    setStudyGenError("");
    setStudyGenCodes([]);
    try {
      const payload: Record<string, unknown> = { count: studyCount };
      if (studyMaxRed) payload.maxRedemptions = parseInt(studyMaxRed, 10);
      if (studyExpiry) payload.expiresAt = studyExpiry;
      const data = await apiFetch(`${API_BASE}/${study.id}/codes`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const newCodes: string[] = ((data as { codes: StudyCode[] }).codes ?? []).map(
        (c) => (typeof c === "string" ? c : c.code)
      );
      setStudyGenCodes(newCodes);
      setPage(1);
      await fetchCodes(1);
    } catch (err) {
      setStudyGenError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setStudyGenerating(false);
    }
  }

  async function handleStudyCopyAll() {
    await navigator.clipboard.writeText(studyGenCodes.join("\n"));
    setStudyCopied(true);
    setTimeout(() => setStudyCopied(false), 2000);
  }

  // ── Targeted group code generation ───────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenError("");
    setGeneratedCodes([]);
    try {
      const payload: Record<string, unknown> = { groupId: genGroupId, count: genCount };
      if (genMaxRed) payload.maxRedemptions = parseInt(genMaxRed, 10);
      if (genExpiry) payload.expiresAt = genExpiry;
      const data = await apiFetch(`${API_BASE}/${study.id}/codes`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const newCodes: string[] = ((data as { codes: StudyCode[] }).codes ?? []).map(
        (c) => (typeof c === "string" ? c : c.code)
      );
      setGeneratedCodes(newCodes);
      setPage(1);
      await fetchCodes(1);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyAll() {
    await navigator.clipboard.writeText(generatedCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke(code: string) {
    setRevoking(code);
    try {
      await apiFetch(`${API_BASE}/${study.id}/codes/${code}`, token, { method: "DELETE" });
      await fetchCodes(page);
    } catch {
      // ignore
    } finally {
      setRevoking(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.codesTab}>

      {/* ── Allocation sliders ──────────────────────────────────────────── */}
      <div className={styles.genSection}>
        <h3 className={styles.genTitle}>Group allocation</h3>
        <p className={styles.genDesc}>
          Controls how study codes distribute participants across conditions.
          Weights are relative — 2 : 1 : 1 : 1 means the first group gets twice as many participants.
        </p>
        <div className={styles.allocGrid}>
          {study.groups.map((g) => {
            const w = weights[g.id] ?? 1;
            const pct = Math.round((w / totalWeight) * 100);
            return (
              <div key={g.id} className={styles.allocRow}>
                <span className={styles.allocLabel}>{g.label || `Group ${g.index}`}</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={w}
                  className={styles.allocSlider}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))
                  }
                />
                <span className={styles.allocPct}>{pct}%</span>
              </div>
            );
          })}
        </div>
        <div className={styles.allocActions}>
          <button
            className={styles.allocEqualBtn}
            onClick={() =>
              setWeights(Object.fromEntries(study.groups.map((g) => [g.id, 1])))
            }
          >
            = Equal
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSaveAllocation}
            disabled={savingAlloc}
          >
            {allocSaved ? "Saved ✓" : savingAlloc ? "Saving…" : "Save allocation"}
          </button>
        </div>
      </div>

      {/* ── Study-level code generation (primary) ──────────────────────── */}
      <div className={styles.genSection}>
        <h3 className={styles.genTitle}>Generate study codes</h3>
        <p className={styles.genDesc}>
          Codes are tied to the study. Each participant who redeems one is assigned
          to a group automatically using the allocation above.
        </p>
        <div className={styles.genForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Quantity (1–100)</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={100}
              value={studyCount}
              onChange={(e) =>
                setStudyCount(Math.min(100, Math.max(1, Number(e.target.value))))
              }
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Max redemptions (optional)</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={studyMaxRed}
              onChange={(e) => setStudyMaxRed(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Expiry (optional)</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={studyExpiry}
              onChange={(e) => setStudyExpiry(e.target.value)}
            />
          </div>
        </div>
        {studyGenError && <div className={styles.errorMsg}>{studyGenError}</div>}
        <button
          className={styles.saveBtn}
          onClick={handleStudyGenerate}
          disabled={studyGenerating}
        >
          {studyGenerating ? "Generating…" : "Generate codes"}
        </button>
        {studyGenCodes.length > 0 && (
          <div className={styles.genResult}>
            <div className={styles.genResultHeader}>
              <span className={styles.genResultTitle}>
                {studyGenCodes.length} code{studyGenCodes.length !== 1 ? "s" : ""} generated
              </span>
              <button className={styles.copyAllBtn} onClick={handleStudyCopyAll}>
                {studyCopied ? "Copied!" : "Copy all"}
              </button>
            </div>
            <div className={styles.codeList}>
              {studyGenCodes.map((c) => (
                <span key={c} className={styles.codeChip}>{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Targeted group codes (secondary, collapsible) ───────────────── */}
      <div className={styles.genSection}>
        <button
          className={styles.targetedToggle}
          onClick={() => setTargetOpen((o) => !o)}
        >
          {targetOpen ? "▾" : "▸"} Targeted group codes
          <span className={styles.targetedToggleSub}>
            — pin a code to a specific condition
          </span>
        </button>
        {targetOpen && (
          <>
            <div className={styles.genForm} style={{ marginTop: "0.75rem" }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Group</label>
                <select
                  className={styles.select}
                  value={genGroupId}
                  onChange={(e) => setGenGroupId(e.target.value)}
                >
                  {study.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label || `Group ${g.index}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Quantity (1–100)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={100}
                  value={genCount}
                  onChange={(e) =>
                    setGenCount(Math.min(100, Math.max(1, Number(e.target.value))))
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Max redemptions (optional)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={genMaxRed}
                  onChange={(e) => setGenMaxRed(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Expiry (optional)</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={genExpiry}
                  onChange={(e) => setGenExpiry(e.target.value)}
                />
              </div>
            </div>
            {genError && <div className={styles.errorMsg}>{genError}</div>}
            <button
              className={styles.saveBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generating…" : "Generate targeted codes"}
            </button>
            {generatedCodes.length > 0 && (
              <div className={styles.genResult}>
                <div className={styles.genResultHeader}>
                  <span className={styles.genResultTitle}>
                    {generatedCodes.length} code{generatedCodes.length !== 1 ? "s" : ""} generated
                  </span>
                  <button className={styles.copyAllBtn} onClick={handleCopyAll}>
                    {copied ? "Copied!" : "Copy all"}
                  </button>
                </div>
                <div className={styles.codeList}>
                  {generatedCodes.map((c) => (
                    <span key={c} className={styles.codeChip}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Codes table ─────────────────────────────────────────────────── */}
      <div className={styles.codesTableSection}>
        <h3 className={styles.genTitle}>Existing codes</h3>
        {codesError && <div className={styles.errorMsg}>{codesError}</div>}
        {loadingCodes ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : codes.length === 0 ? (
          <div className={styles.emptyState}>No codes yet.</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Group</th>
                    <th>Redemptions</th>
                    <th>Expiry</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.code}>
                      <td><span className={styles.codeText}>{c.code}</span></td>
                      <td>
                        {c.groupId ? (
                          groupLabel(c.groupId)
                        ) : (
                          <span className={styles.autoAssignedBadge}>Auto-assigned</span>
                        )}
                      </td>
                      <td>{c.redemptionCount}/{c.maxRedemptions ?? "∞"}</td>
                      <td>{fmtDateTime(c.expiresAt)}</td>
                      <td>
                        {c.redemptionCount > 0 ? (
                          <span className={styles.revokeDisabled} title="Cannot revoke a redeemed code">
                            Revoke
                          </span>
                        ) : (
                          <button
                            className={styles.revokeBtn}
                            onClick={() => handleRevoke(c.code)}
                            disabled={revoking === c.code}
                          >
                            {revoking === c.code ? "…" : "Revoke"}
                          </button>
                        )}
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
    </div>
  );
}

// ── Participants tab ───────────────────────────────────────────────────────────

interface EnrollmentRow {
  userId: string;
  groupId: string | null;
  groupLabel: string;
  enrolledAt: string | null;
  codeUsed: string | null;
}

interface ParticipantSummary {
  total: number;
  perGroup: { groupId: string; groupLabel: string; count: number }[];
}

function ParticipantsTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  const PARTICIPANTS_BASE =
    (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
    `/admin/studies/${study.id}/participants`;

  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [summary, setSummary] = useState<ParticipantSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await apiFetch(
          `${PARTICIPANTS_BASE}?page=${p}&limit=${limit}`,
          token
        );
        setRows(
          (data as { participants: EnrollmentRow[] }).participants ?? []
        );
        setTotal((data as { total: number }).total ?? 0);
        setSummary(
          (data as { summary: ParticipantSummary }).summary ?? null
        );
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load participants"
        );
      } finally {
        setLoading(false);
      }
    },
    [PARTICIPANTS_BASE, token]
  );

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  async function handleDownloadCsv() {
    setExporting(true);
    try {
      // Fetch all records (up to 500)
      const data = await apiFetch(
        `${PARTICIPANTS_BASE}?page=1&limit=500`,
        token
      );
      const all: EnrollmentRow[] =
        (data as { participants: EnrollmentRow[] }).participants ?? [];

      const header = "User ID,Group,Enrolled At,Code Used";
      const csvLines = all.map((r) =>
        [
          `"${r.userId}"`,
          `"${r.groupLabel}"`,
          `"${r.enrolledAt ? new Date(r.enrolledAt).toISOString() : ""}"`,
          `"${r.codeUsed ?? "direct/default"}"`,
        ].join(",")
      );
      const csv = [header, ...csvLines].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${study.name.replace(/[^a-z0-9]/gi, "_")}_participants.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail on export errors
    } finally {
      setExporting(false);
    }
  }

  const EXPORT_BASE =
    (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
    `/admin/studies/${study.id}/export`;

  async function handleExportZip() {
    setExportingZip(true);
    try {
      const res = await fetch(EXPORT_BASE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${study.name.replace(/[^a-z0-9]/gi, "_")}_research_export.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExportingZip(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.participantsTab}>
      {/* Summary row */}
      {summary && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryStat}>
            <span className={styles.summaryStatLabel}>Total enrolled:</span>
            <span className={styles.summaryStatValue}>{summary.total}</span>
          </span>
          {summary.perGroup.map((g) => (
            <span key={g.groupId} className={styles.summaryStat}>
              <span className={styles.summaryStatLabel}>{g.groupLabel}:</span>
              <span className={styles.summaryStatValue}>{g.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Table header with CSV button */}
      <div className={styles.participantsTableHeader}>
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          {total} participant{total !== 1 ? "s" : ""} enrolled
        </span>
        <button
          className={styles.csvBtn}
          onClick={handleDownloadCsv}
          disabled={exporting || total === 0}
        >
          {exporting ? "Exporting…" : "Download CSV"}
        </button>
        <button
          className={styles.csvBtn}
          onClick={handleExportZip}
          disabled={exportingZip || total === 0}
        >
          {exportingZip ? "Exporting…" : "Export ZIP (R-ready)"}
        </button>
      </div>

      {loadError && <div className={styles.errorMsg}>{loadError}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>No participants enrolled yet.</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Group</th>
                  <th>Enrolled</th>
                  <th>Code Used</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <span className={styles.userIdCell}>{r.userId}</span>
                    </td>
                    <td>{r.groupLabel}</td>
                    <td>{fmtDate(r.enrolledAt)}</td>
                    <td>
                      {r.codeUsed ? (
                        <span className={styles.codePill}>{r.codeUsed}</span>
                      ) : (
                        <span className={styles.codeDefault}>
                          direct/default
                        </span>
                      )}
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

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificationsTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("all");
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [toast, setToast] = useState("");

  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState("");

  const [sentHistory, setSentHistory] = useState<SentNotification[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);

  const fetchScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    setCancelError("");
    try {
      const data = await apiFetch(
        `${NOTIFICATIONS_BASE}?studyId=${study.id}&status=scheduled`,
        token
      );
      const items = Array.isArray(data)
        ? data
        : (data as { campaigns?: ScheduledNotification[] }).campaigns ?? data;
      setScheduled(Array.isArray(items) ? items : []);
    } catch {
      // non-critical
    } finally {
      setLoadingScheduled(false);
    }
  }, [study.id, token]);

  const fetchSentHistory = useCallback(async () => {
    setLoadingSent(true);
    try {
      const data = await apiFetch(
        `${NOTIFICATIONS_BASE}?studyId=${study.id}&status=sent&limit=20`,
        token
      );
      const items = Array.isArray(data)
        ? data
        : (data as { campaigns?: SentNotification[] }).campaigns ?? data;
      setSentHistory(Array.isArray(items) ? (items as SentNotification[]) : []);
    } catch {
      // non-critical
    } finally {
      setLoadingSent(false);
    }
  }, [study.id, token]);

  useEffect(() => {
    fetchScheduled();
    fetchSentHistory();
  }, [fetchScheduled, fetchSentHistory]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function handleSend() {
    if (!title.trim()) { setSendError("Title is required."); return; }
    if (!body.trim()) { setSendError("Body is required."); return; }
    if (sendMode === "schedule" && !scheduledAt) {
      setSendError("Scheduled time is required.");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const payload: Record<string, unknown> = {
        studyId: study.id,
        title: title.trim(),
        body: body.trim(),
        targetType: targetGroupId === "all" ? "all_enrolled" : "group",
        targetIds: targetGroupId === "all" ? [] : [targetGroupId],
      };
      if (sendMode === "schedule") {
        payload.scheduledFor = new Date(scheduledAt).toISOString();
      }

      const result = await apiFetch(NOTIFICATIONS_BASE, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (sendMode === "now") {
        const r = result as { recipientCount?: number };
        showToast(`Sent to ${r.recipientCount ?? 0} participant${(r.recipientCount ?? 0) !== 1 ? "s" : ""}`);
      } else {
        showToast(
          `Scheduled for ${new Date(scheduledAt).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}`
        );
        await fetchScheduled();
      }
      setTitle(""); setBody(""); setTargetGroupId("all");
      setSendMode("now"); setScheduledAt("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    setCancelError("");
    try {
      await apiFetch(`${NOTIFICATIONS_BASE}/${id}`, token, { method: "DELETE" });
      setScheduled((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className={styles.notificationsTab}>
      {/* Compose form */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>Compose notification</p>
        {sendError && <div className={styles.errorMsg}>{sendError}</div>}
        {toast && <div className={styles.toastMsg}>{toast}</div>}

        <div className={styles.notifForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Title <span className={styles.charHint}>({title.length}/50)</span>
            </label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 50))}
              placeholder="Notification title"
              maxLength={50}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              Body <span className={styles.charHint}>({body.length}/200)</span>
            </label>
            <textarea
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 200))}
              placeholder="Notification body text"
              maxLength={200}
              rows={3}
            />
          </div>

          <div className={styles.notifFormRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Target</label>
              <select
                className={styles.select}
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
              >
                <option value="all">All participants</option>
                {study.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Send time</label>
              <select
                className={styles.select}
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value as "now" | "schedule")}
              >
                <option value="now">Now</option>
                <option value="schedule">Schedule</option>
              </select>
            </div>
          </div>

          {sendMode === "schedule" && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Scheduled date &amp; time</label>
              <input
                className={styles.input}
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          )}

          <div className={styles.notifFormFooter}>
            <button
              className={styles.saveBtn}
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? "Sending…" : sendMode === "now" ? "Send" : "Schedule"}
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled notifications */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>Scheduled</p>
        {cancelError && <div className={styles.errorMsg}>{cancelError}</div>}
        {loadingScheduled ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : scheduled.length === 0 ? (
          <div className={styles.notifEmpty}>No pending scheduled notifications.</div>
        ) : (
          <div className={styles.scheduledList}>
            {scheduled.map((n) => (
              <div key={n.id} className={styles.scheduledItem}>
                <div className={styles.scheduledItemMain}>
                  <span className={styles.scheduledTitle}>{n.title}</span>
                  <span className={styles.scheduledBody}>{n.body}</span>
                  <span className={styles.scheduledMeta}>
                    {n.targetType === "group" && n.targetIds.length > 0
                      ? study.groups.find((g) => n.targetIds.includes(g.id))?.label ?? n.targetIds[0]
                      : "All participants"}
                    {" · "}
                    {fmtDateTime(n.scheduledFor)}
                  </span>
                </div>
                <button
                  className={styles.revokeBtn}
                  onClick={() => handleCancel(n.id)}
                  disabled={cancellingId === n.id}
                >
                  {cancellingId === n.id ? "…" : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent notification history */}
      <div className={styles.notifSection}>
        <p className={styles.notifSectionTitle}>Sent history</p>
        {loadingSent ? (
          <div className={styles.loadingState}>Loading…</div>
        ) : sentHistory.length === 0 ? (
          <div className={styles.notifEmpty}>No notifications sent yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Target</th>
                  <th>Recipients</th>
                  <th>Sent at</th>
                </tr>
              </thead>
              <tbody>
                {sentHistory.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <span className={styles.scheduledTitle}>{n.title}</span>
                      <span className={styles.scheduledBody} style={{ display: "block", fontSize: "0.78rem" }}>
                        {n.body}
                      </span>
                    </td>
                    <td>
                      {n.targetType === "group" && n.targetIds.length > 0
                        ? study.groups.find((g) => n.targetIds.includes(g.id))?.label ?? n.targetIds[0]
                        : "All participants"}
                    </td>
                    <td>{n.recipientCount ?? "—"}</td>
                    <td>{fmtDateTime(n.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cue config tab ────────────────────────────────────────────────────────────

function CueConfigTab({
  study,
  token,
}: {
  study: StudySummary;
  token: string;
}) {
  const [groupStates, setGroupStates] = useState<
    Record<string, CueConfig & { saving: boolean; saved: boolean; error: string }>
  >(() =>
    Object.fromEntries(
      study.groups.map((g) => [
        g.id,
        {
          cueCount: g.cueConfig?.cueCount ?? "multi",
          cueSource: g.cueConfig?.cueSource ?? "high_quality",
          cuePoolId: g.cueConfig?.cuePoolId ?? null,
          behaviorOptions:
            g.cueConfig?.behaviorOptions ?? BEHAVIOR_OPTIONS.map((b) => b.key),
          maxHabits: g.cueConfig?.maxHabits ?? null,
          saving: false,
          saved: false,
          error: "",
        },
      ])
    )
  );

  function update(
    groupId: string,
    patch: Partial<(typeof groupStates)[string]>
  ) {
    setGroupStates((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], ...patch, saved: false },
    }));
  }

  function toggleBehavior(groupId: string, key: string) {
    const current = groupStates[groupId].behaviorOptions;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    update(groupId, { behaviorOptions: next });
  }

  async function handleSave(groupId: string) {
    const s = groupStates[groupId];
    update(groupId, { saving: true, error: "" });
    try {
      await apiFetch(
        `${API_BASE}/${study.id}/groups/${groupId}/cue-config`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            cueCount: s.cueCount,
            cueSource: s.cueSource,
            cuePoolId: s.cuePoolId,
            behaviorOptions: s.behaviorOptions,
            maxHabits: s.maxHabits,
          }),
        }
      );
      update(groupId, { saving: false, saved: true });
    } catch (err) {
      update(groupId, {
        saving: false,
        error: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  if (study.groups.length === 0) {
    return (
      <div className={styles.emptyState}>
        No groups defined. Add groups in the Details tab first.
      </div>
    );
  }

  return (
    <div>
      {study.groups.map((g) => {
        const s = groupStates[g.id];
        if (!s) return null;
        return (
          <div key={g.id} className={styles.cueConfigGroup}>
            <p className={styles.cueConfigGroupLabel}>
              {g.label || `Group ${g.index}`}
            </p>
            {s.error && <div className={styles.errorMsg}>{s.error}</div>}
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue count</label>
                <select
                  className={styles.select}
                  value={s.cueCount}
                  onChange={(e) =>
                    update(g.id, {
                      cueCount: e.target.value as "single" | "multi",
                    })
                  }
                >
                  <option value="single">Single cue</option>
                  <option value="multi">Multi-cue</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cue source</label>
                <select
                  className={styles.select}
                  value={s.cueSource}
                  onChange={(e) =>
                    update(g.id, {
                      cueSource: e.target.value as CueConfig["cueSource"],
                    })
                  }
                >
                  <option value="low_quality">Low quality (pre-rated)</option>
                  <option value="high_quality">High quality (pre-rated)</option>
                  <option value="self_selected">Self-selected</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Max habits</label>
                <select
                  className={styles.select}
                  value={s.maxHabits ?? ""}
                  onChange={(e) =>
                    update(g.id, {
                      maxHabits: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Unlimited (public)</option>
                  <option value="1">1 (study participant)</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup} style={{ marginTop: "0.75rem" }}>
              <label className={styles.label}>Allowed behaviors</label>
              <div className={styles.behaviorCheckboxes}>
                {BEHAVIOR_OPTIONS.map((b) => (
                  <label key={b.key} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={s.behaviorOptions.includes(b.key)}
                      onChange={() => toggleBehavior(g.id, b.key)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.cueConfigFooter}>
              {s.saved && <span className={styles.savedMsg}>Saved!</span>}
              <button
                className={styles.saveBtn}
                onClick={() => handleSave(g.id)}
                disabled={s.saving}
              >
                {s.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Study form modal ──────────────────────────────────────────────────────────

type ModalTab = "details" | "questionnaires" | "codes" | "participants" | "notifications" | "cue-config";

function StudyModal({
  initial,
  token,
  onClose,
  onSaved,
  onSetDefault,
  onDeactivate,
}: {
  initial: StudySummary | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  onSetDefault: (id: string) => Promise<void>;
  onDeactivate: (id: string) => Promise<{ error?: string } | void>;
}) {
  const isEdit = initial !== null;
  const [activeTab, setActiveTab] = useState<ModalTab>("details");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(
    initial?.description ?? ""
  );
  const [groupCount, setGroupCount] = useState(
    initial?.groups.length ?? 1
  );
  const [groupLabels, setGroupLabels] = useState<string[]>(() => {
    if (initial) return initial.groups.map((g) => g.label);
    return [""];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [confirmDefaultOpen, setConfirmDefaultOpen] = useState(false);

  function handleGroupCountChange(n: number) {
    setGroupCount(n);
    setGroupLabels((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
  }

  function handleGroupLabelChange(i: number, val: string) {
    setGroupLabels((prev) => prev.map((l, idx) => (idx === i ? val : l)));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        groups: groupLabels.slice(0, groupCount).map((label) => ({ label })),
      };
      if (isEdit) {
        await apiFetch(`${API_BASE}/${initial!.id}`, token, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(API_BASE, token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleSetDefaultClick() {
    setConfirmDefaultOpen(true);
  }

  async function handleSetDefaultConfirm() {
    if (!initial) return;
    setConfirmDefaultOpen(false);
    setSettingDefault(true);
    setError("");
    try {
      await onSetDefault(initial.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default");
    } finally {
      setSettingDefault(false);
    }
  }

  async function handleDeactivate() {
    if (!initial) return;
    setDeactivating(true);
    setError("");
    try {
      const result = await onDeactivate(initial.id);
      if (result && (result as { error?: string }).error) {
        setError((result as { error: string }).error);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivate failed");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            {isEdit ? "Edit Study" : "New Study"}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {isEdit && (
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "details" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("details")}
            >
              Details
            </button>
            <button
              className={`${styles.tab} ${activeTab === "questionnaires" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("questionnaires")}
            >
              Questionnaires
            </button>
            <button
              className={`${styles.tab} ${activeTab === "codes" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("codes")}
            >
              Codes
            </button>
            <button
              className={`${styles.tab} ${activeTab === "participants" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("participants")}
            >
              Participants
            </button>
            <button
              className={`${styles.tab} ${activeTab === "notifications" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("notifications")}
            >
              Notifications
            </button>
            <button
              className={`${styles.tab} ${activeTab === "cue-config" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("cue-config")}
            >
              Cue Config
            </button>

          </div>
        )}

        <div className={styles.modalBody}>
          {activeTab === "details" ? (
            <>
              {error && <div className={styles.errorMsg}>{error}</div>}

              {isEdit && initial?.isDefault && (
                <div className={styles.defaultBadgeRow}>
                  <span className={styles.badgeDefault}>Default study</span>
                </div>
              )}

              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.label}>Name *</label>
                  <input
                    className={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Autumn 2025 Cohort"
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.formFull}`}>
                  <label className={styles.label}>Description</label>
                  <textarea
                    className={styles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description for this study"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Number of groups</label>
                  <select
                    className={styles.select}
                    value={groupCount}
                    onChange={(e) =>
                      handleGroupCountChange(Number(e.target.value))
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </div>
              </div>

              <div className={styles.groupLabelsSection}>
                <p className={styles.groupLabelsTitle}>Group labels</p>
                <div className={styles.groupLabelsGrid}>
                  {Array.from({ length: groupCount }).map((_, i) => (
                    <div key={i} className={styles.formGroup}>
                      <label className={styles.label}>Group {i + 1}</label>
                      <input
                        className={styles.input}
                        value={groupLabels[i] ?? ""}
                        onChange={(e) =>
                          handleGroupLabelChange(i, e.target.value)
                        }
                        placeholder={`Group ${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : activeTab === "questionnaires" ? (
            initial && (
              <QuestionnairesTab
                study={initial}
                token={token}
                onSaved={onSaved}
              />
            )
          ) : activeTab === "codes" ? (
            initial && <CodesTab study={initial} token={token} />
          ) : activeTab === "participants" ? (
            initial && <ParticipantsTab study={initial} token={token} />
          ) : activeTab === "cue-config" ? (
            initial && <CueConfigTab study={initial} token={token} />
          ) : (
            initial && <NotificationsTab study={initial} token={token} />
          )}
        </div>

        {confirmDefaultOpen && (
          <div className={styles.confirmDialog}>
            <p className={styles.confirmMsg}>
              Set <strong>{initial?.name}</strong> as the default study?
              Participants without a study code will be enrolled here.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setConfirmDefaultOpen(false)}
              >
                Cancel
              </button>
              <button
                className={styles.defaultBtn}
                onClick={handleSetDefaultConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className={styles.modalFooter}>
            {isEdit && (
              <div className={styles.modalFooterLeft}>
                {!initial?.isDefault && (
                  <button
                    className={styles.defaultBtn}
                    onClick={handleSetDefaultClick}
                    disabled={settingDefault}
                  >
                    {settingDefault ? "Setting…" : "Set as Default"}
                  </button>
                )}
                {initial?.isActive && (
                  initial?.isDefault ? (
                    <button
                      className={styles.deactivateBtn}
                      disabled
                      title="Cannot deactivate the default study. Set another study as default first."
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className={styles.deactivateBtn}
                      onClick={handleDeactivate}
                      disabled={deactivating}
                    >
                      {deactivating ? "Deactivating…" : "Deactivate"}
                    </button>
                  )
                )}
              </div>
            )}
            <div className={styles.modalFooterRight}>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * Displays and manages research studies, including groups, participants,
 * questionnaire assignments, codes, notifications, and cue configuration.
 *
 * @returns The studies management page.
 */
export default function StudiesPage() {
  const { studies, loading, error, token, refetch: fetchList } = useStudiesData();
  const [actionError, setActionError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudySummary | null>(null);

  function handleOpenCreate() {
    setEditTarget(null);
    setModalOpen(true);
    setActionError("");
  }

  function handleOpenEdit(study: StudySummary) {
    setEditTarget(study);
    setModalOpen(true);
    setActionError("");
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditTarget(null);
  }

  async function handleModalSaved() {
    setModalOpen(false);
    setEditTarget(null);
    await fetchList();
  }

  async function handleSetDefault(id: string) {
    await apiFetch(`${API_BASE}/${id}/default`, token, { method: "PUT" });
  }

  async function handleDeactivate(
    id: string
  ): Promise<{ error?: string } | void> {
    try {
      await apiFetch(`${API_BASE}/${id}`, token, { method: "DELETE" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deactivate failed";
      // 409 means participants enrolled — return as error to show inline
      return { error: msg };
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Studies</h1>
          <p className={styles.subtitle}>
            Manage studies, groups, and participant enrolment.
          </p>
        </div>
        <button className={styles.addButton} onClick={handleOpenCreate}>
          + New Study
        </button>
      </div>

      {actionError && (
        <div className={styles.errorMsg}>{actionError}</div>
      )}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : error ? (
        <div className={styles.errorMsg}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Groups</th>
                <th>Participants</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {studies.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyState}>
                      No studies yet. Click &quot;New Study&quot; to create
                      one.
                    </div>
                  </td>
                </tr>
              ) : (
                studies.map((study) => (
                  <tr
                    key={study.id}
                    className={styles.clickableRow}
                    onClick={() => handleOpenEdit(study)}
                  >
                    <td>
                      <span className={styles.studyName}>{study.name}</span>
                      {study.isDefault && (
                        <span className={styles.badgeDefault}>Default</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          study.isActive
                            ? styles.badgeActive
                            : styles.badgeInactive
                        }`}
                      >
                        {study.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{study.groups.length}</td>
                    <td>{study.participantCount ?? 0}</td>
                    <td>{fmtDate(study.createdAt)}</td>
                    <td>
                      <div
                        className={styles.actions}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleOpenEdit(study)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <StudyModal
          initial={editTarget}
          token={token}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
          onSetDefault={handleSetDefault}
          onDeactivate={handleDeactivate}
        />
      )}
    </div>
  );
}
