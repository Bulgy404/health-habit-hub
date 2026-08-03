"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { apiUrl } from "@/lib/api";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Spinner } from "@/components/spinner";
import styles from "./page.module.css";
import { useQuestionnairesData } from "./useQuestionnairesData";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "library" | "custom";
type QuestionType = "single_choice" | "multi_choice" | "scale" | "text";

/** Per-language text, e.g. `{ en: 'Hello', de: 'Hallo' }`. */
type LocaleText = Partial<Record<"en" | "de" | "fr" | "ja" | "nl", string>>;
type Lang = keyof Required<LocaleText>;
const SUPPORTED_LANGS: Lang[] = ["en", "de", "fr", "ja", "nl"];
const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
  nl: "Nederlands",
};

interface QuestionOption {
  value: string;
  label: LocaleText;
}

interface Question {
  id: string;
  type: QuestionType;
  text: LocaleText;
  required: boolean;
  options: QuestionOption[];
}

interface QuestionnaireSummary {
  id: string;
  slug: string;
  title: LocaleText;
  description: LocaleText;
  version: string;
  languages: Lang[];
  active: boolean;
  isLibrary: boolean;
  // 'study' (default): anchored to enrollment, applies once per participant.
  // 'habit': anchored to each habit's creation, applies once per habit.
  scope: "study" | "habit";
  questionCount: number;
  updatedAt: string | null;
}

interface QuestionnaireDetail extends QuestionnaireSummary {
  questions: Question[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolves a locale-text map to a single string for display (admin-side preview only). */
function previewText(map: LocaleText | undefined, lang: Lang = "en"): string {
  if (!map) return "";
  return map[lang] || map.en || Object.values(map).find(Boolean) || "";
}

/** Strips language keys not in [languages] from a locale-text map. */
function pruneLocaleText(map: LocaleText, languages: Lang[]): LocaleText {
  const next: LocaleText = {};
  for (const lang of languages) {
    if (map[lang]) next[lang] = map[lang];
  }
  return next;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeQuestion(): Question {
  return { id: crypto.randomUUID(), type: "text", text: {}, required: false, options: [] };
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

const API_BASE = apiUrl("/admin/questionnaires");

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
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: { path: string; message: string }[];
    };
    const detailText = body.details?.length
      ? `: ${body.details.map((d) => `${d.path} — ${d.message}`).join("; ")}`
      : "";
    const err = new Error((body.error ?? `HTTP ${res.status}`) + detailText);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

// ── Question card component ───────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  activeLang,
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
  activeLang: Lang;
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

  function updateText(value: string) {
    onChange({ ...question, text: { ...question.text, [activeLang]: value } });
  }

  function addOption() {
    onChange({
      ...question,
      options: [...question.options, { value: String(question.options.length), label: {} }],
    });
  }

  function updateOptionLabel(i: number, val: string) {
    const opts = [...question.options];
    opts[i] = { ...opts[i], label: { ...opts[i].label, [activeLang]: val } };
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
              value={question.text[activeLang] ?? ""}
              onChange={(e) => updateText(e.target.value)}
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
                  value={opt.label[activeLang] ?? ""}
                  onChange={(e) => updateOptionLabel(i, e.target.value)}
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
          <ToggleSwitch
            className={styles.requiredToggle}
            checked={question.required}
            onChange={(e) => updateField("required", e.target.checked)}
            label={t("required")}
          />
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
  const [title, setTitle] = useState<LocaleText>(initial?.title ?? {});
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugManual, setSlugManual] = useState(isEdit);
  const [description, setDescription] = useState<LocaleText>(initial?.description ?? {});
  const [version, setVersion] = useState(initial?.version ?? "1");
  const [scope, setScope] = useState<"study" | "habit">(initial?.scope ?? "study");
  const [languages, setLanguages] = useState<Lang[]>(initial?.languages ?? ["en"]);
  const [activeLang, setActiveLang] = useState<Lang>(initial?.languages?.[0] ?? "en");
  const [questions, setQuestions] = useState<Question[]>(initial?.questions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleTitleChange(val: string) {
    setTitle((prev) => ({ ...prev, [activeLang]: val }));
    if (!slugManual) {
      setSlug(slugify(val));
    }
  }

  function toggleLanguage(lang: Lang) {
    setLanguages((prev) => {
      const next = prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang];
      // Keep at least one language selected.
      if (next.length === 0) return prev;
      if (activeLang === lang && !next.includes(lang)) {
        setActiveLang(next[0]);
      }
      return next;
    });
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
    const prunedTitle = pruneLocaleText(title, languages);
    // Validate against the *pruned* text, not the raw state: a language typed
    // into earlier and then deselected still lingers in state but won't be
    // sent, so checking the raw map would pass client-side and then fail the
    // server's non-empty check with an opaque "Validation failed".
    if (!Object.values(prunedTitle).some(Boolean)) {
      setError(t("titleRequiredError"));
      return;
    }
    const prunedQuestions = questions.map((q) => ({
      ...q,
      text: pruneLocaleText(q.text, languages),
      options: q.options.map((o) => ({ ...o, label: pruneLocaleText(o.label, languages) })),
    }));
    const emptyQuestionIndex = prunedQuestions.findIndex(
      (q) => !Object.values(q.text).some(Boolean)
    );
    if (emptyQuestionIndex !== -1) {
      setError(t("questionTextRequiredError", { index: emptyQuestionIndex + 1 }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        slug: slug || undefined,
        title: prunedTitle,
        description: pruneLocaleText(description, languages),
        version,
        languages,
        questions: prunedQuestions,
        scope,
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

          <div className={styles.formGroup} style={{ marginBottom: "1rem" }}>
            <label className={styles.label}>{t("languagesLabel")}</label>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {SUPPORTED_LANGS.map((lang) => (
                <ToggleSwitch
                  key={lang}
                  checked={languages.includes(lang)}
                  onChange={() => toggleLanguage(lang)}
                  label={LANG_LABELS[lang]}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              {languages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setActiveLang(lang)}
                  style={
                    activeLang === lang
                      ? { fontWeight: 700, textDecoration: "underline" }
                      : undefined
                  }
                >
                  {t("editingLanguage", { language: LANG_LABELS[lang] })}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("titleLabel")}</label>
              <input
                className={styles.input}
                value={title[activeLang] ?? ""}
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
                value={description[activeLang] ?? ""}
                onChange={(e) =>
                  setDescription((prev) => ({ ...prev, [activeLang]: e.target.value }))
                }
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
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("scopeLabel")}</label>
              <select
                className={styles.select}
                value={scope}
                onChange={(e) => setScope(e.target.value as "study" | "habit")}
              >
                <option value="study">{t("scopeStudyOption")}</option>
                <option value="habit">{t("scopeHabitOption")}</option>
              </select>
              <span className={styles.hint}>
                {scope === "habit" ? t("scopeHabitHint") : t("scopeStudyHint")}
              </span>
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
                  activeLang={activeLang}
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
            {saving ? <Spinner /> : isEdit ? t("saveChanges") : t("create")}
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
  const [previewLang, setPreviewLang] = useState<Lang>(questionnaire.languages?.[0] ?? "en");

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
        // The admin endpoint (by id) returns the full, unresolved locale-map
        // data needed to preview every language — the participant-facing
        // endpoint (by slug) would only ever return one resolved language.
        const data = (await apiFetch(
          `${API_BASE}/${questionnaire.id}`,
          token
        )) as QuestionnaireDetail;
        setDetail(data);
      } catch {
        setError(t("loadDetailsFailed"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [questionnaire, token, t]);

  const languages = detail?.languages ?? questionnaire.languages ?? ["en"];

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{previewText(questionnaire.title, previewLang)}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {languages.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
              {languages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setPreviewLang(lang)}
                  style={
                    previewLang === lang
                      ? { fontWeight: 700, textDecoration: "underline" }
                      : undefined
                  }
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          )}
          {previewText(questionnaire.description, previewLang) && (
            <p className={styles.previewDescription}>
              {previewText(questionnaire.description, previewLang)}
            </p>
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
                  <p className={styles.previewQText}>
                    {previewText(q.text, previewLang) || <em>{t("noText")}</em>}
                  </p>
                  {q.options.length > 0 && (
                    <ul className={styles.previewOptions}>
                      {q.options.map((opt, oi) => (
                        <li key={oi}>{previewText(opt.label, previewLang)}</li>
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
      // The admin endpoint (by id) returns the full, unresolved locale-map
      // data needed to edit every language — the participant-facing
      // endpoint (by slug) only ever returns one resolved language, and
      // saving that back would silently destroy every other translation.
      const data = (await apiFetch(`${API_BASE}/${q.id}`, token)) as QuestionnaireDetail;
      setEditTarget({
        ...q,
        title: data.title ?? {},
        description: data.description ?? {},
        languages: data.languages ?? ["en"],
        questions: (data.questions ?? []).map(
          (qq: Partial<Question> & { id?: string; text?: unknown; options?: unknown[] }) => ({
            id: qq.id ?? crypto.randomUUID(),
            type: (qq.type ?? "text") as QuestionType,
            text: typeof qq.text === "string" ? { en: qq.text } : ((qq.text as LocaleText) ?? {}),
            required: qq.required ?? false,
            options: Array.isArray(qq.options)
              ? qq.options.map((o: unknown, oi: number) =>
                  typeof o === "string"
                    ? { value: String(oi), label: { en: o } }
                    : {
                        value: (o as { value?: string }).value ?? String(oi),
                        label:
                          typeof (o as { label?: unknown }).label === "string"
                            ? { en: (o as { label: string }).label }
                            : ((o as { label?: LocaleText }).label ?? {}),
                      }
                )
              : [],
          })
        ),
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
        setActionError(t("assignedDeleteError", { title: previewText(q.title) }));
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
                    <th>{t("scopeHeader")}</th>
                    <th>{t("languagesHeader")}</th>
                    <th>{t("questionsHeader")}</th>
                    <th>{t("version")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>{t("noLibraryQuestionnaires")}</div>
                      </td>
                    </tr>
                  ) : (
                    libraryQuestionnaires.map((q) => (
                      <tr key={q.id}>
                        <td>{previewText(q.title)}</td>
                        <td>
                          <span className={styles.slugCell}>{q.slug}</span>
                        </td>
                        <td>
                          {q.scope === "habit" ? t("scopeHabitOption") : t("scopeStudyOption")}
                        </td>
                        <td>{(q.languages ?? []).map((l) => l.toUpperCase()).join(", ")}</td>
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
                    <th>{t("scopeHeader")}</th>
                    <th>{t("languagesHeader")}</th>
                    <th>{t("questionsHeader")}</th>
                    <th>{t("version")}</th>
                    <th>{t("lastUpdated")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customQuestionnaires.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className={styles.emptyState}>{t("noCustomQuestionnaires")}</div>
                      </td>
                    </tr>
                  ) : (
                    customQuestionnaires.map((q) => {
                      const isAssigned = assignedIds.has(q.id);
                      return (
                        <tr key={q.id}>
                          <td>{previewText(q.title)}</td>
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
                          <td>
                            {q.scope === "habit" ? t("scopeHabitOption") : t("scopeStudyOption")}
                          </td>
                          <td>{(q.languages ?? []).map((l) => l.toUpperCase()).join(", ")}</td>
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
          title={previewText(deleteTarget.title)}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
