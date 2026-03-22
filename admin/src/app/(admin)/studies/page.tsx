"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyGroup {
  id: string;
  label: string;
  index: number;
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
  groupId: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  createdAt: string | null;
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
  const [codes, setCodes] = useState<StudyCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codesError, setCodesError] = useState("");

  // Generate form state
  const [genGroupId, setGenGroupId] = useState(
    study.groups[0]?.id ?? ""
  );
  const [genCount, setGenCount] = useState(1);
  const [genMaxRed, setGenMaxRed] = useState("");
  const [genExpiry, setGenExpiry] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

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
        setCodesError(
          err instanceof Error ? err.message : "Failed to load codes"
        );
      } finally {
        setLoadingCodes(false);
      }
    },
    [study.id, token]
  );

  useEffect(() => {
    fetchCodes(page);
  }, [fetchCodes, page]);

  function groupLabel(groupId: string): string {
    const g = study.groups.find((grp) => grp.id === groupId);
    return g ? g.label || `Group ${g.index}` : groupId;
  }

  async function handleGenerate() {
    if (!genGroupId) {
      setGenError("Please select a group.");
      return;
    }
    setGenerating(true);
    setGenError("");
    setGeneratedCodes([]);
    try {
      const payload: Record<string, unknown> = {
        groupId: genGroupId,
        count: genCount,
      };
      if (genMaxRed) payload.maxRedemptions = parseInt(genMaxRed, 10);
      if (genExpiry) payload.expiresAt = genExpiry;
      const data = await apiFetch(`${API_BASE}/${study.id}/codes`, token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const newCodes: string[] = (
        (data as { codes: StudyCode[] }).codes ?? []
      ).map((c) => (typeof c === "string" ? c : c.code));
      setGeneratedCodes(newCodes);
      // Refresh list from page 1
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
      await apiFetch(`${API_BASE}/${study.id}/codes/${code}`, token, {
        method: "DELETE",
      });
      await fetchCodes(page);
    } catch {
      // ignore — button is disabled when redeemed so errors are unexpected
    } finally {
      setRevoking(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.codesTab}>
      {/* Generate form */}
      <div className={styles.genSection}>
        <h3 className={styles.genTitle}>Generate Codes</h3>
        <div className={styles.genForm}>
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
            <label className={styles.label}>Expiry date/time (optional)</label>
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
          {generating ? "Generating…" : "Generate Codes"}
        </button>

        {generatedCodes.length > 0 && (
          <div className={styles.genResult}>
            <div className={styles.genResultHeader}>
              <span className={styles.genResultTitle}>
                {generatedCodes.length} code
                {generatedCodes.length !== 1 ? "s" : ""} generated
              </span>
              <button className={styles.copyAllBtn} onClick={handleCopyAll}>
                {copied ? "Copied!" : "Copy All"}
              </button>
            </div>
            <div className={styles.codeList}>
              {generatedCodes.map((c) => (
                <span key={c} className={styles.codeChip}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Codes table */}
      <div className={styles.codesTableSection}>
        <h3 className={styles.genTitle}>Existing Codes</h3>
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
                      <td>
                        <span className={styles.codeText}>{c.code}</span>
                      </td>
                      <td>{groupLabel(c.groupId)}</td>
                      <td>
                        {c.redemptionCount}/
                        {c.maxRedemptions ?? "∞"}
                      </td>
                      <td>{fmtDateTime(c.expiresAt)}</td>
                      <td>
                        {c.redemptionCount > 0 ? (
                          <span
                            className={styles.revokeDisabled}
                            title="Cannot revoke a redeemed code"
                          >
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
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
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

// ── Study form modal ──────────────────────────────────────────────────────────

type ModalTab = "details" | "questionnaires" | "codes";

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

  async function handleSetDefault() {
    if (!initial) return;
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
          ) : (
            initial && <CodesTab study={initial} token={token} />
          )}
        </div>

        {activeTab === "details" && (
          <div className={styles.modalFooter}>
            {isEdit && (
              <div className={styles.modalFooterLeft}>
                {!initial?.isDefault && (
                  <button
                    className={styles.defaultBtn}
                    onClick={handleSetDefault}
                    disabled={settingDefault}
                  >
                    {settingDefault ? "Setting…" : "Set as Default"}
                  </button>
                )}
                {initial?.isActive && (
                  <button
                    className={styles.deactivateBtn}
                    onClick={handleDeactivate}
                    disabled={deactivating}
                  >
                    {deactivating ? "Deactivating…" : "Deactivate"}
                  </button>
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

export default function StudiesPage() {
  const { data: session } = useSession();
  const token =
    (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudySummary | null>(null);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(API_BASE, token);
      const items: StudySummary[] = Array.isArray(data)
        ? data
        : (data as { studies?: StudySummary[] }).studies ?? [];
      setStudies(items);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load studies"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

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
