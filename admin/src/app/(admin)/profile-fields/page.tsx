"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { apiUrl } from "@/lib/api";
import { ToggleSwitch } from "@/components/toggle-switch";
import { SpinnerLabel } from "@/components/spinner";
import styles from "./page.module.css";
import sharedStyles from "@/components/admin-page.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "library" | "custom";
type FieldType = "text" | "number" | "date" | "select";
const VALID_TYPES: FieldType[] = ["text", "number", "date", "select"];

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

interface ProfileFieldOption {
  value: string;
  label: LocaleText;
}

interface ProfileFieldDefinition {
  fieldId: string;
  label: LocaleText;
  type: FieldType;
  options: ProfileFieldOption[];
  languages: Lang[];
  required: boolean;
  order: number;
  isLibrary: boolean;
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

function emptyForm(): ProfileFieldDefinition {
  return {
    fieldId: "",
    label: {},
    type: "text",
    options: [],
    languages: ["en"],
    required: false,
    order: 0,
    isLibrary: false,
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = apiUrl("/admin/profile-field-definitions");

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

// ── Form modal (create / edit custom field) ───────────────────────────────────

function FieldModal({
  initial,
  token,
  onClose,
  onSaved,
}: {
  initial: ProfileFieldDefinition | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");
  const isEdit = initial !== null;
  const [fieldId, setFieldId] = useState(initial?.fieldId ?? "");
  const [label, setLabel] = useState<LocaleText>(initial?.label ?? {});
  const [type, setType] = useState<FieldType>(initial?.type ?? "text");
  const [languages, setLanguages] = useState<Lang[]>(initial?.languages ?? ["en"]);
  const [activeLang, setActiveLang] = useState<Lang>(initial?.languages?.[0] ?? "en");
  const [options, setOptions] = useState<ProfileFieldOption[]>(initial?.options ?? []);
  const [required, setRequired] = useState(initial?.required ?? false);
  const [order, setOrder] = useState(initial?.order ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleLanguage(lang: Lang) {
    setLanguages((prev) => {
      const next = prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang];
      if (next.length === 0) return prev;
      if (activeLang === lang && !next.includes(lang)) {
        setActiveLang(next[0]);
      }
      return next;
    });
  }

  function addOption() {
    setOptions((prev) => [...prev, { value: "", label: {} }]);
  }

  function updateOptionValue(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, value } : o)));
  }

  function updateOptionLabel(i: number, val: string) {
    setOptions((prev) =>
      prev.map((o, idx) => (idx === i ? { ...o, label: { ...o.label, [activeLang]: val } } : o))
    );
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const prunedLabel = pruneLocaleText(label, languages);
    if (!Object.values(prunedLabel).some(Boolean)) {
      setError(t("labelRequiredError"));
      return;
    }
    if (!isEdit && !/^[a-z][a-z0-9_-]*$/.test(fieldId)) {
      setError(t("fieldIdInvalidError"));
      return;
    }
    const prunedOptions = options.map((o) => ({
      ...o,
      label: pruneLocaleText(o.label, languages),
    }));
    if (type === "select") {
      if (prunedOptions.length === 0) {
        setError(t("optionsRequiredError"));
        return;
      }
      const emptyOptionIndex = prunedOptions.findIndex(
        (o) => !o.value.trim() || !Object.values(o.label).some(Boolean)
      );
      if (emptyOptionIndex !== -1) {
        setError(t("optionIncompleteError", { number: emptyOptionIndex + 1 }));
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...(isEdit ? {} : { fieldId }),
        label: prunedLabel,
        type,
        options: type === "select" ? prunedOptions : [],
        languages,
        required,
        order,
      };
      if (isEdit) {
        await apiFetch(`${API_BASE}/${initial!.fieldId}`, token, {
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
            {isEdit ? t("editFieldTitle") : t("addFieldTitle")}
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
              <label className={styles.label}>{t("fieldIdColumn")}</label>
              <input
                className={styles.input}
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value)}
                placeholder={t("fieldIdPlaceholder")}
                disabled={isEdit}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("labelColumn")}</label>
              <input
                className={styles.input}
                value={label[activeLang] ?? ""}
                onChange={(e) => setLabel((prev) => ({ ...prev, [activeLang]: e.target.value }))}
                placeholder={t("labelPlaceholder")}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("typeColumn")}</label>
              <select
                className={styles.select}
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
              >
                {VALID_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(`types.${ft}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("orderColumn")}</label>
              <input
                className={styles.input}
                type="number"
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t("requiredColumn")}</label>
              <ToggleSwitch
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                aria-label={t("requiredColumn")}
              />
            </div>
          </div>

          {type === "select" && (
            <div className={styles.builderSection}>
              <div className={styles.builderHeader}>
                <span className={styles.builderTitle}>{t("optionsLabel")}</span>
                <button className={styles.addQBtn} onClick={addOption} type="button">
                  {t("addOption")}
                </button>
              </div>

              {options.length === 0 ? (
                <div className={styles.emptyQuestions}>{t("noOptionsYet")}</div>
              ) : (
                options.map((opt, i) => (
                  <div key={i} className={styles.optionRow}>
                    <input
                      className={styles.optionInput}
                      style={{ maxWidth: "160px", fontFamily: "monospace" }}
                      value={opt.value}
                      onChange={(e) => updateOptionValue(i, e.target.value)}
                      placeholder={t("optionValuePlaceholder")}
                    />
                    <input
                      className={styles.optionInput}
                      value={opt.label[activeLang] ?? ""}
                      onChange={(e) => updateOptionLabel(i, e.target.value)}
                      placeholder={t("optionLabelPlaceholder")}
                    />
                    <button
                      className={styles.removeOptionBtn}
                      onClick={() => removeOption(i)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            {tc("cancel")}
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            <SpinnerLabel loading={saving} label={isEdit ? t("saveChanges") : t("create")} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview modal (read-only, for library fields) ─────────────────────────────

function FieldPreviewModal({
  field,
  onClose,
}: {
  field: ProfileFieldDefinition;
  onClose: () => void;
}) {
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");
  const [previewLang, setPreviewLang] = useState<Lang>(field.languages?.[0] ?? "en");
  const languages = field.languages?.length ? field.languages : (["en"] as Lang[]);

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{previewText(field.label, previewLang)}</span>
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
          <div className={styles.previewMeta}>
            <span>{t(`types.${field.type}`)}</span>
            <span className={`${styles.badge} ${styles.badgeLibrary}`}>{t("libraryBadge")}</span>
          </div>

          {field.options.length > 0 && (
            <ul className={styles.previewOptions}>
              {field.options.map((opt, i) => (
                <li key={i}>
                  <code>{opt.value}</code> — {previewText(opt.label, previewLang)}
                </li>
              ))}
            </ul>
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
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmDialog}>
        <p className={styles.confirmTitle}>{t("deleteFieldTitle")}</p>
        <p className={styles.confirmText}>
          {t.rich("deleteConfirmText", { label, strong: (chunks) => <strong>{chunks}</strong> })}
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
 * Displays and manages profile field definitions shown during onboarding,
 * mirroring the Questionnaires page: a Library tab of shipped defaults (age
 * group, gender) and a Custom tab for study-specific fields.
 *
 * @returns The profile fields management page.
 */
export default function ProfileFieldsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("library");
  const [defs, setDefs] = useState<ProfileFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProfileFieldDefinition | null>(null);
  const [previewTarget, setPreviewTarget] = useState<ProfileFieldDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfileFieldDefinition | null>(null);
  const [actionError, setActionError] = useState("");

  async function fetchList() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(API_BASE, token);
      setDefs((data as ProfileFieldDefinition[]).slice().sort((a, b) => a.order - b.order));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleOpenCreate() {
    setEditTarget(null);
    setModalOpen(true);
    setActionError("");
  }

  function handleOpenEdit(def: ProfileFieldDefinition) {
    setEditTarget(def);
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

  async function handleDelete(def: ProfileFieldDefinition) {
    setDeleteTarget(null);
    setActionError("");
    try {
      await apiFetch(`${API_BASE}/${def.fieldId}`, token, { method: "DELETE" });
      await fetchList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("deleteFailed"));
    }
  }

  const libraryFields = defs.filter((d) => d.isLibrary);
  const customFields = defs.filter((d) => !d.isLibrary);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        {tab === "custom" && (
          <button className={styles.addButton} onClick={handleOpenCreate}>
            {t("addField")}
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
      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("labelColumn")}</th>
                <th>{t("fieldIdColumn")}</th>
                <th>{t("typeColumn")}</th>
                <th>{t("languagesHeader")}</th>
                <th>{t("requiredColumn")}</th>
                {tab === "custom" && <th>{t("orderColumn")}</th>}
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className={sharedStyles.skeletonRow}>
                  {Array.from({ length: tab === "custom" ? 7 : 6 }).map((__, j) => (
                    <td key={j}>
                      <span className={sharedStyles.skeletonBar} style={{ width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Library tab */}
          {tab === "library" && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("labelColumn")}</th>
                    <th>{t("fieldIdColumn")}</th>
                    <th>{t("typeColumn")}</th>
                    <th>{t("languagesHeader")}</th>
                    <th>{t("requiredColumn")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryFields.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className={styles.emptyState}>{t("noLibraryFields")}</div>
                      </td>
                    </tr>
                  ) : (
                    libraryFields.map((def) => (
                      <tr key={def.fieldId}>
                        <td>{previewText(def.label)}</td>
                        <td>
                          <code>{def.fieldId}</code>
                        </td>
                        <td>{t(`types.${def.type}`)}</td>
                        <td>{(def.languages ?? []).map((l) => l.toUpperCase()).join(", ")}</td>
                        <td>{def.required ? tc("yes") : tc("no")}</td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              className={styles.actionBtn}
                              onClick={() => setPreviewTarget(def)}
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
                    <th>{t("labelColumn")}</th>
                    <th>{t("fieldIdColumn")}</th>
                    <th>{t("typeColumn")}</th>
                    <th>{t("languagesHeader")}</th>
                    <th>{t("requiredColumn")}</th>
                    <th>{t("orderColumn")}</th>
                    <th>{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {customFields.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>{t("emptyState")}</div>
                      </td>
                    </tr>
                  ) : (
                    customFields.map((def) => (
                      <tr key={def.fieldId}>
                        <td>{previewText(def.label)}</td>
                        <td>
                          <code>{def.fieldId}</code>
                        </td>
                        <td>{t(`types.${def.type}`)}</td>
                        <td>{(def.languages ?? []).map((l) => l.toUpperCase()).join(", ")}</td>
                        <td>{def.required ? tc("yes") : tc("no")}</td>
                        <td>{def.order}</td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              className={styles.actionBtn}
                              onClick={() => handleOpenEdit(def)}
                            >
                              {tc("edit")}
                            </button>
                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                              onClick={() => setDeleteTarget(def)}
                            >
                              {tc("delete")}
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
        </>
      )}

      {modalOpen && (
        <FieldModal
          initial={editTarget}
          token={token}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
        />
      )}

      {previewTarget && (
        <FieldPreviewModal field={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          label={previewText(deleteTarget.label)}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
