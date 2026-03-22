"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "library" | "custom";
type QuestionType = "single_choice" | "multi_choice" | "scale" | "text";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options: string[];
}

interface QuestionnaireSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  version: string;
  active: boolean;
  isLibrary: boolean;
  questionCount: number;
  updatedAt: string | null;
}

interface QuestionnaireDetail extends QuestionnaireSummary {
  questions: Question[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeQuestion(): Question {
  return { id: crypto.randomUUID(), type: "text", text: "", required: false, options: [] };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/admin/questionnaires";
const PARTICIPANT_API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/questionnaires";

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
    const err = new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

// ── Question card component ───────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragOver,
}: {
  question: Question;
  index: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}) {
  const hasOptions = question.type === "single_choice" || question.type === "multi_choice";

  function updateField<K extends keyof Question>(key: K, value: Question[K]) {
    const updated = { ...question, [key]: value };
    if (key === "type" && !hasOptions) {
      updated.options = [];
    }
    onChange(updated);
  }

  function addOption() {
    onChange({ ...question, options: [...question.options, ""] });
  }

  function updateOption(i: number, val: string) {
    const opts = [...question.options];
    opts[i] = val;
    onChange({ ...question, options: opts });
  }

  function removeOption(i: number) {
    onChange({ ...question, options: question.options.filter((_, idx) => idx !== i) });
  }

  const cardClass = [
    styles.questionCard,
    isDragging ? styles.questionCardDragging : "",
    isDragOver ? styles.questionCardDragOver : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClass}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={styles.questionCardHeader}>
        <span className={styles.dragHandle}>⠿</span>
        <span className={styles.questionIndex}>Q{index + 1}</span>
      </div>
      <div className={styles.questionCardBody}>
        <div className={styles.questionRow}>
          <div className={`${styles.formGroup} ${styles.questionTextInput}`}>
            <input
              className={styles.input}
              placeholder="Question text"
              value={question.text}
              onChange={(e) => updateField("text", e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <select
              className={`${styles.select} ${styles.questionTypeSelect}`}
              value={question.type}
              onChange={(e) => updateField("type", e.target.value as QuestionType)}
            >
              <option value="text">Text</option>
              <option value="single_choice">Single choice</option>
              <option value="multi_choice">Multi choice</option>
              <option value="scale">Scale</option>
            </select>
          </div>
        </div>

        {hasOptions && (
          <div className={styles.optionsSection}>
            <p className={styles.optionsLabel}>Options</p>
            {question.options.map((opt, i) => (
              <div key={i} className={styles.optionRow}>
                <input
                  className={styles.optionInput}
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                <button className={styles.removeOptionBtn} onClick={() => removeOption(i)} type="button">
                  ×
                </button>
              </div>
            ))}
            <button className={styles.addOptionBtn} onClick={addOption} type="button">
              + Add option
            </button>
          </div>
        )}

        <div className={styles.questionFooter}>
          <label className={styles.requiredToggle}>
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => updateField("required", e.target.checked)}
            />
            Required
          </label>
          <button className={styles.removeQBtn} onClick={onRemove} type="button">
            Remove question
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form modal (create / edit custom) ─────────────────────────────────────────

function QuestionnaireModal({
  initial,
  token,
  onClose,
  onSaved,
}: {
  initial: QuestionnaireDetail | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = initial !== null;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugManual, setSlugManual] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [version, setVersion] = useState(initial?.version ?? "1");
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManual) {
      setSlug(slugify(val));
    }
  }

  function handleSlugChange(val: string) {
    setSlug(val);
    setSlugManual(true);
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, makeQuestion()]);
  }

  function updateQuestion(i: number, q: Question) {
    setQuestions((qs) => qs.map((old, idx) => (idx === i ? q : old)));
  }

  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function handleDragStart(i: number) {
    dragIndex.current = i;
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOverIndex(i);
  }

  function handleDrop(i: number) {
    const from = dragIndex.current;
    if (from === null || from === i) {
      dragIndex.current = null;
      setDragOverIndex(null);
      return;
    }
    setQuestions((qs) => {
      const arr = [...qs];
      const [item] = arr.splice(from, 1);
      arr.splice(i, 0, item);
      return arr;
    });
    dragIndex.current = null;
    setDragOverIndex(null);
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { slug: slug || undefined, title, description, version, questions };
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

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{isEdit ? "Edit Questionnaire" : "Add Questionnaire"}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Title *</label>
              <input
                className={styles.input}
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Sleep Quality Index"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Slug</label>
              <input
                className={styles.input}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. sliq (auto-generated)"
                disabled={isEdit}
              />
            </div>
            <div className={`${styles.formGroup} ${styles.formFull}`}>
              <label className={styles.label}>Description</label>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description shown to participants"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Version</label>
              <input
                className={styles.input}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          <div className={styles.builderSection}>
            <div className={styles.builderHeader}>
              <span className={styles.builderTitle}>Questions ({questions.length})</span>
              <button className={styles.addQBtn} onClick={addQuestion} type="button">
                + Add question
              </button>
            </div>

            {questions.length === 0 ? (
              <div className={styles.emptyQuestions}>No questions yet. Click &quot;Add question&quot; to begin.</div>
            ) : (
              questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  onChange={(updated) => updateQuestion(i, updated)}
                  onRemove={() => removeQuestion(i)}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  isDragging={dragIndex.current === i}
                  isDragOver={dragOverIndex === i && dragIndex.current !== i}
                />
              ))
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview modal (read-only, for library questionnaires) ─────────────────────

function QuestionnairePreviewModal({
  questionnaire,
  token,
  onClose,
}: {
  questionnaire: QuestionnaireSummary;
  token: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<QuestionnaireDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = (await apiFetch(`${PARTICIPANT_API}/${questionnaire.slug}`, token)) as QuestionnaireDetail;
        const questions: Question[] = (data.questions ?? []).map((q: Partial<Question> & { id?: string }) => ({
          id: q.id ?? crypto.randomUUID(),
          type: (q.type ?? "text") as QuestionType,
          text: q.text ?? "",
          required: q.required ?? false,
          options: Array.isArray(q.options) ? q.options : [],
        }));
        setDetail({ ...questionnaire, questions });
      } catch {
        setError("Failed to load questionnaire details.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [questionnaire, token]);

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{questionnaire.title}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {questionnaire.description && (
            <p className={styles.previewDescription}>{questionnaire.description}</p>
          )}
          <div className={styles.previewMeta}>
            <span>Version {questionnaire.version}</span>
            <span className={`${styles.badge} ${styles.badgeLibrary}`}>Library</span>
          </div>

          {loading ? (
            <div className={styles.loadingState}>Loading questions…</div>
          ) : error ? (
            <div className={styles.errorMsg}>{error}</div>
          ) : detail && detail.questions.length > 0 ? (
            <div className={styles.previewQuestions}>
              {detail.questions.map((q, i) => (
                <div key={q.id} className={styles.previewQuestion}>
                  <div className={styles.previewQuestionHeader}>
                    <span className={styles.questionIndex}>Q{i + 1}</span>
                    <span className={styles.previewQType}>{q.type.replace("_", " ")}</span>
                    {q.required && <span className={styles.previewRequired}>Required</span>}
                  </div>
                  <p className={styles.previewQText}>{q.text || <em>(no text)</em>}</p>
                  {q.options.length > 0 && (
                    <ul className={styles.previewOptions}>
                      {q.options.map((opt, oi) => (
                        <li key={oi}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyQuestions}>No questions defined.</div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.saveBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmTitle}>Delete questionnaire?</p>
        <p className={styles.confirmText}>
          You are about to delete <strong>{title}</strong>. This action cannot be undone.
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuestionnairesPage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";

  const [tab, setTab] = useState<Tab>("library");
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuestionnaireDetail | null>(null);
  const [previewTarget, setPreviewTarget] = useState<QuestionnaireSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireSummary | null>(null);
  const [actionError, setActionError] = useState("");
  // IDs known to be assigned to an active study (delete blocked)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(API_BASE, token);
      setQuestionnaires(data as QuestionnaireSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questionnaires");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function handleOpenEdit(q: QuestionnaireSummary) {
    setActionError("");
    try {
      const data = (await apiFetch(`${PARTICIPANT_API}/${q.slug}`, token)) as QuestionnaireDetail;
      setEditTarget({
        ...q,
        questions: (data.questions ?? []).map((qq: Partial<Question> & { id?: string }) => ({
          id: qq.id ?? crypto.randomUUID(),
          type: (qq.type ?? "text") as QuestionType,
          text: qq.text ?? "",
          required: qq.required ?? false,
          options: Array.isArray(qq.options) ? qq.options : [],
        })),
      });
      setModalOpen(true);
    } catch {
      setActionError("Failed to load questionnaire details.");
    }
  }

  function handleOpenCreate() {
    setEditTarget(null);
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

  async function handleDelete(q: QuestionnaireSummary) {
    setDeleteTarget(null);
    setActionError("");
    try {
      await apiFetch(`${API_BASE}/${q.id}`, token, { method: "DELETE" });
      await fetchList();
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 409) {
        setAssignedIds((prev) => { const next = new Set(prev); next.add(q.id); return next; });
        setActionError(`"${q.title}" is assigned to an active study and cannot be deleted.`);
      } else {
        setActionError(err instanceof Error ? err.message : "Delete failed");
      }
    }
  }

  const libraryQuestionnaires = questionnaires.filter((q) => q.isLibrary);
  const customQuestionnaires = questionnaires.filter((q) => !q.isLibrary);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Questionnaires</h1>
          <p className={styles.subtitle}>Browse the library and manage custom questionnaires for your studies.</p>
        </div>
        {tab === "custom" && (
          <button className={styles.addButton} onClick={handleOpenCreate}>
            + Add Questionnaire
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "library" ? styles.tabActive : ""}`}
          onClick={() => { setTab("library"); setActionError(""); }}
        >
          Library
        </button>
        <button
          className={`${styles.tab} ${tab === "custom" ? styles.tabActive : ""}`}
          onClick={() => { setTab("custom"); setActionError(""); }}
        >
          Custom
        </button>
      </div>

      {actionError && <div className={styles.errorMsg}>{actionError}</div>}

      {loading ? (
        <div className={styles.loadingState}>Loading…</div>
      ) : error ? (
        <div className={styles.errorMsg}>{error}</div>
      ) : (
        <>
          {/* Library tab */}
          {tab === "library" && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Questions</th>
                    <th>Version</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.emptyState}>No library questionnaires found.</div>
                      </td>
                    </tr>
                  ) : (
                    libraryQuestionnaires.map((q) => (
                      <tr key={q.id}>
                        <td>{q.title}</td>
                        <td>
                          <span className={styles.slugCell}>{q.slug}</span>
                        </td>
                        <td>{q.questionCount}</td>
                        <td>{q.version}</td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              className={styles.actionBtn}
                              onClick={() => { setPreviewTarget(q); setActionError(""); }}
                            >
                              Preview
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

          {/* Custom tab */}
          {tab === "custom" && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Questions</th>
                    <th>Version</th>
                    <th>Last updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>
                          No custom questionnaires yet. Click &quot;Add Questionnaire&quot; to create one.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    customQuestionnaires.map((q) => {
                      const isAssigned = assignedIds.has(q.id);
                      return (
                        <tr key={q.id}>
                          <td>{q.title}</td>
                          <td>
                            <span className={styles.slugCell}>{q.slug ?? "—"}</span>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${q.active ? styles.badgeActive : styles.badgeInactive}`}>
                              {q.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>{q.questionCount}</td>
                          <td>{q.version}</td>
                          <td>{fmtDate(q.updatedAt)}</td>
                          <td>
                            <div className={styles.actions}>
                              <button className={styles.actionBtn} onClick={() => handleOpenEdit(q)}>
                                Edit
                              </button>
                              <button
                                className={`${styles.actionBtn} ${styles.actionBtnDanger} ${isAssigned ? styles.actionBtnDisabled : ""}`}
                                onClick={() => { if (!isAssigned) { setDeleteTarget(q); setActionError(""); } }}
                                disabled={isAssigned}
                                title={isAssigned ? "Assigned to an active study — cannot delete" : undefined}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <QuestionnaireModal
          initial={editTarget}
          token={token}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
        />
      )}

      {previewTarget && (
        <QuestionnairePreviewModal
          questionnaire={previewTarget}
          token={token}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          title={deleteTarget.title}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
