"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import styles from "./page.module.css";
import { useQuestionnairesData } from "./useQuestionnairesData";

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
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/admin/questionnaires";
const PARTICIPANT_API =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") + "/questionnaires";

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
  const t = useTranslations("questionnaires");
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
        <span className={styles.questionIndex}>{t("questionLabel", { index: index + 1 })}</span>
      </div>
      <div className={styles.questionCardBody}>
        <div className={styles.questionRow}>
          <div className={`${styles.formGroup} ${styles.questionTextInput}`}>
            <input
              className={styles.input}
              placeholder={t("questionTextPlaceholder")}
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
              <option value="text">{t("types.text")}</option>
              <option value="single_choice">{t("types.singleChoice")}</option>
              <option value="multi_choice">{t("types.multiChoice")}</option>
              <option value="scale">{t("types.scale")}</option>
            </select>
          </div>
        </div>

        {hasOptions && (
          <div className={styles.optionsSection}>
            <p className={styles.optionsLabel}>{t("optionsLabel")}</p>
            {question.options.map((opt, i) => (
              <div key={i} className={styles.optionRow}>
                <input
                  className={styles.optionInput}
                  placeholder={t("optionPlaceholder", { number: i + 1 })}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                <button
                  className={styles.removeOptionBtn}
                  onClick={() => removeOption(i)}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
            <button className={styles.addOptionBtn} onClick={addOption} type="button">
              {t("addOption")}
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
            {t("required")}
          </label>
          <button className={styles.removeQBtn} onClick={onRemove} type="button">
            {t("removeQuestion")}
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
  const t = useTranslations("questionnaires");
  const tc = useTranslations("common");
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
      setError(t("titleRequiredError"));
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
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            {isEdit ? t("editQuestionnaire") : t("addQuestionnaire")}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("titleLabel")}</label>
              <input
                className={styles.input}
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={t("titlePlaceholder")}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("slugLabel")}</label>
              <input
                className={styles.input}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={t("slugPlaceholder")}
                disabled={isEdit}
              />
            </div>
            <div className={`${styles.formGroup} ${styles.formFull}`}>
              <label className={styles.label}>{tc("description")}</label>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("version")}</label>
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
              <span className={styles.builderTitle}>
                {t("questionsCount", { count: questions.length })}
              </span>
              <button className={styles.addQBtn} onClick={addQuestion} type="button">
                {t("addQuestion")}
              </button>
            </div>

            {questions.length === 0 ? (
              <div className={styles.emptyQuestions}>{t("noQuestionsYet")}</div>
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
            {tc("cancel")}
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? tc("saving") : isEdit ? t("saveChanges") : t("create")}
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
  const t = useTranslations("questionnaires");
  const tc = useTranslations("common");
  const [detail, setDetail] = useState<QuestionnaireDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const typeLabel = (type: QuestionType) =>
    ({
      text: t("types.text"),
      single_choice: t("types.singleChoice"),
      multi_choice: t("types.multiChoice"),
      scale: t("types.scale"),
    })[type];

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = (await apiFetch(
          `${PARTICIPANT_API}/${questionnaire.slug}`,
          token
        )) as QuestionnaireDetail;
        const questions: Question[] = (data.questions ?? []).map(
          (q: Partial<Question> & { id?: string }) => ({
            id: q.id ?? crypto.randomUUID(),
            type: (q.type ?? "text") as QuestionType,
            text: q.text ?? "",
            required: q.required ?? false,
            // Options may be stored as {value, label} objects (legacy format from library
            // questionnaires). Normalize to strings for display.
            options: Array.isArray(q.options)
              ? q.options.map((o: unknown) =>
                  typeof o === "string"
                    ? o
                    : ((o as { label?: string }).label ??
                      String((o as { value?: unknown }).value ?? o))
                )
              : [],
          })
        );
        setDetail({ ...questionnaire, questions });
      } catch {
        setError(t("loadDetailsFailed"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [questionnaire, token, t]);

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
            <span>{t("versionValue", { version: questionnaire.version })}</span>
            <span className={`${styles.badge} ${styles.badgeLibrary}`}>{t("libraryBadge")}</span>
          </div>

          {loading ? (
            <div className={styles.loadingState}>{t("loadingQuestions")}</div>
          ) : error ? (
            <div className={styles.errorMsg}>{error}</div>
          ) : detail && detail.questions.length > 0 ? (
            <div className={styles.previewQuestions}>
              {detail.questions.map((q, i) => (
                <div key={q.id} className={styles.previewQuestion}>
                  <div className={styles.previewQuestionHeader}>
                    <span className={styles.questionIndex}>
                      {t("questionLabel", { index: i + 1 })}
                    </span>
                    <span className={styles.previewQType}>{typeLabel(q.type)}</span>
                    {q.required && <span className={styles.previewRequired}>{t("required")}</span>}
                  </div>
                  <p className={styles.previewQText}>{q.text || <em>{t("noText")}</em>}</p>
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
            <div className={styles.emptyQuestions}>{t("noQuestionsDefined")}</div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.saveBtn} onClick={onClose}>
            {tc("close")}
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
  const t = useTranslations("questionnaires");
  const tc = useTranslations("common");
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmTitle}>{t("deleteQuestionnaireTitle")}</p>
        <p className={styles.confirmText}>
          {t.rich("deleteConfirmText", { title, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {tc("cancel")}
          </button>
          <button className={styles.confirmDeleteBtn} onClick={onConfirm}>
            {tc("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

/**
 * Displays and manages questionnaires, including browsing the library and
 * creating, editing, or deleting custom questionnaires for studies.
 *
 * @returns The questionnaires management page.
 */
export default function QuestionnairesPage() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? "";
  const t = useTranslations("questionnaires");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("library");
  const { questionnaires, loading, error, refetch: fetchList } = useQuestionnairesData(token);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuestionnaireDetail | null>(null);
  const [previewTarget, setPreviewTarget] = useState<QuestionnaireSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireSummary | null>(null);
  const [actionError, setActionError] = useState("");
  // IDs known to be assigned to an active study (delete blocked)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());

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
          // Normalize {value, label} options (library format) to plain strings.
          options: Array.isArray(qq.options)
            ? qq.options.map((o: unknown) =>
                typeof o === "string"
                  ? o
                  : ((o as { label?: string }).label ??
                    String((o as { value?: unknown }).value ?? o))
              )
            : [],
        })),
      });
      setModalOpen(true);
    } catch {
      setActionError(t("loadDetailsFailed"));
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
        setAssignedIds((prev) => {
          const next = new Set(prev);
          next.add(q.id);
          return next;
        });
        setActionError(t("assignedDeleteError", { title: q.title }));
      } else {
        setActionError(err instanceof Error ? err.message : t("deleteFailed"));
      }
    }
  }

  const libraryQuestionnaires = questionnaires.filter((q) => q.isLibrary);
  const customQuestionnaires = questionnaires.filter((q) => !q.isLibrary);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        {tab === "custom" && (
          <button className={styles.addButton} onClick={handleOpenCreate}>
            {t("addQuestionnaireButton")}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "library" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("library");
            setActionError("");
          }}
        >
          {t("libraryTab")}
        </button>
        <button
          className={`${styles.tab} ${tab === "custom" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("custom");
            setActionError("");
          }}
        >
          {t("customTab")}
        </button>
      </div>

      {actionError && <div className={styles.errorMsg}>{actionError}</div>}

      {loading ? (
        <div className={styles.loadingState}>{tc("loading")}</div>
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
                    <th>{t("titleHeader")}</th>
                    <th>{t("slugHeader")}</th>
                    <th>{t("questionsHeader")}</th>
                    <th>{t("version")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.emptyState}>{t("noLibraryQuestionnaires")}</div>
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
                              onClick={() => {
                                setPreviewTarget(q);
                                setActionError("");
                              }}
                            >
                              {t("preview")}
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
                    <th>{t("titleHeader")}</th>
                    <th>{t("slugHeader")}</th>
                    <th>{tc("status")}</th>
                    <th>{t("questionsHeader")}</th>
                    <th>{t("version")}</th>
                    <th>{t("lastUpdated")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>{t("noCustomQuestionnaires")}</div>
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
                            <span
                              className={`${styles.badge} ${q.active ? styles.badgeActive : styles.badgeInactive}`}
                            >
                              {q.active ? t("active") : t("inactive")}
                            </span>
                          </td>
                          <td>{q.questionCount}</td>
                          <td>{q.version}</td>
                          <td>{fmtDate(q.updatedAt)}</td>
                          <td>
                            <div className={styles.actions}>
                              <button
                                className={styles.actionBtn}
                                onClick={() => handleOpenEdit(q)}
                              >
                                {tc("edit")}
                              </button>
                              <button
                                className={`${styles.actionBtn} ${styles.actionBtnDanger} ${isAssigned ? styles.actionBtnDisabled : ""}`}
                                onClick={() => {
                                  if (!isAssigned) {
                                    setDeleteTarget(q);
                                    setActionError("");
                                  }
                                }}
                                disabled={isAssigned}
                                title={isAssigned ? t("assignedCannotDelete") : undefined}
                              >
                                {tc("delete")}
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
