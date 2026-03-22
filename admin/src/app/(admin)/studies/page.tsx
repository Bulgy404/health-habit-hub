"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyGroup {
  label: string;
}

interface StudySummary {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  groups: StudyGroup[];
  participantCount: number;
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

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/studies";

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

// ── Study form modal ──────────────────────────────────────────────────────────

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
        questionnaires: [],
      };
      if (isEdit) {
        await apiFetch(`${API_BASE}/${initial!._id}`, token, {
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
      await onSetDefault(initial._id);
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
      const result = await onDeactivate(initial._id);
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

        <div className={styles.modalBody}>
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
        </div>

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
                    key={study._id}
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
