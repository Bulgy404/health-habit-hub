"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  listConsentDocuments,
  getConsentDocument,
  saveConsentDocument,
  revertConsentDocument,
  ConsentDocumentValidationError,
  SLUG_PATTERN,
  type ConsentDocumentSummary,
  type ConsentLanguageState,
  type EditableConsentDocument,
  type DocumentStatus,
} from "@/lib/consentDocumentsApi";
import styles from "@/components/admin-page.module.css";

const LANG_LABELS: Record<string, string> = {
  en: "English",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
  nl: "Nederlands",
};

/**
 * Split a readiness reason into its message key and argument.
 *
 * The API returns `missing_languages:ja,nl` rather than a sentence, so the
 * portal can render it in the admin's own language. Splitting on the FIRST
 * colon matters: `version_mismatch:1.0.0,2.0.0` contains no further colons
 * today, but a value that did would otherwise be truncated.
 */
function splitReason(reason: string): { key: string; arg: string } {
  const i = reason.indexOf(":");
  return i === -1
    ? { key: reason, arg: "" }
    : { key: reason.slice(0, i), arg: reason.slice(i + 1) };
}

/**
 * Study consent documents.
 *
 * The document a participant accepts after redeeming a code for a verified
 * study. Before this page existed it could only be changed by editing a
 * markdown file in the repository and redeploying, which is not a workable
 * loop for text that an ethics committee revises.
 *
 * Two things the page is careful about:
 *
 * 1. It shows, per language, whether the live text is the one shipped with the
 *    app or one edited here. The database wins where a row exists, and hiding
 *    that produces the "I edited it and nothing changed" confusion in reverse.
 * 2. It shows readiness prominently, because a document that is incomplete or
 *    still a draft cannot be attached to a study at all — and the participant
 *    would otherwise discover the problem after enrolling.
 */
export default function ConsentDocumentsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("consentDocuments");
  const tc = useTranslations("common");

  const [documents, setDocuments] = useState<ConsentDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditableConsentDocument | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listConsentDocuments(token);
      setDocuments(data.documents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(slug: string, lang: string) {
    setProblems([]);
    setNotice(null);
    setShowPreview(false);
    try {
      setEditing(await getConsentDocument(token, slug, lang));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    }
  }

  async function onSave() {
    if (!editing) return;
    setSaving(true);
    setProblems([]);
    try {
      await saveConsentDocument(token, editing.slug, editing.lang, {
        body: editing.body,
        version: editing.version,
        effectiveDate: editing.effectiveDate,
        bindingLanguage: editing.bindingLanguage,
        status: editing.status,
      });
      setNotice(t("saved"));
      setEditing(null);
      await load();
    } catch (e) {
      if (e instanceof ConsentDocumentValidationError) {
        setProblems(e.problems);
      } else {
        setProblems([]);
        setError(e instanceof Error ? e.message : tc("genericError"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function onRevert() {
    if (!editing || !window.confirm(t("revertConfirm"))) return;
    try {
      const { document } = await revertConsentDocument(
        token,
        editing.slug,
        editing.lang,
      );
      setEditing(document);
      setNotice(t("reverted"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("genericError"));
    }
  }

  function onNewDocument() {
    const slug = window.prompt(t("newSlugPrompt"))?.trim().toLowerCase();
    if (!slug) return;
    if (!SLUG_PATTERN.test(slug)) {
      setError(t("reasons.invalid_slug"));
      return;
    }
    // The first language is arbitrary; a new document has none, and German is
    // the binding language for every consent text this platform serves.
    void openEditor(slug, "de");
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={onNewDocument}
        >
          {t("newSlug")}
        </button>
      </div>

      <p className={styles.subtitle}>{t("readyHint")}</p>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.subtitle}>{notice}</p>}

      {loading ? (
        <p>{tc("loading")}</p>
      ) : documents.length === 0 ? (
        <p className={styles.muted}>{t("noDocuments")}</p>
      ) : (
        documents.map((doc) => (
          <DocumentCard
            key={doc.slug}
            doc={doc}
            onEdit={(lang) => openEditor(doc.slug, lang)}
          />
        ))
      )}

      {editing && (
        <Editor
          doc={editing}
          problems={problems}
          saving={saving}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((v) => !v)}
          onChange={(patch) => setEditing({ ...editing, ...patch })}
          onSave={onSave}
          onRevert={onRevert}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  onEdit,
}: {
  doc: ConsentDocumentSummary;
  onEdit: (lang: string) => void;
}) {
  const t = useTranslations("consentDocuments");

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        <span className={styles.code}>{doc.slug}</span>{" "}
        <span className={styles.badge}>
          {doc.ready ? t("ready") : t("notReady")}
        </span>
      </h2>

      <p className={styles.muted}>
        {t("usedBy")}:{" "}
        {doc.studies.length === 0
          ? t("usedByNone")
          : doc.studies.map((s) => s.name ?? s.id).join(", ")}
      </p>

      {doc.reasons.length > 0 && (
        <ul className={styles.error}>
          {doc.reasons.map((reason) => {
            const { key, arg } = splitReason(reason);
            return (
              <li key={reason}>
                <ReasonText reasonKey={key} arg={arg} />
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("languages")}</th>
              <th>{t("source")}</th>
              <th>{t("version")}</th>
              <th>{t("effectiveDate")}</th>
              <th>{t("statusPublished")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {doc.languages.map((l) => (
              <LanguageRow key={l.lang} row={l} onEdit={() => onEdit(l.lang)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Renders one machine-readable reason. Unknown keys fall back to the raw
 * string rather than rendering nothing — a reason the portal has not been
 * taught yet must still reach the admin.
 */
function ReasonText({ reasonKey, arg }: { reasonKey: string; arg: string }) {
  const t = useTranslations("consentDocuments.reasons");
  switch (reasonKey) {
    case "document_not_found":
    case "invalid_slug":
      return <>{t(reasonKey)}</>;
    case "missing_languages":
    case "draft_languages":
    case "placeholders_remain":
      return <>{t(reasonKey, { langs: arg })}</>;
    case "version_mismatch":
      return <>{t(reasonKey, { versions: arg })}</>;
    default:
      return <>{arg ? `${reasonKey}: ${arg}` : reasonKey}</>;
  }
}

function LanguageRow({
  row,
  onEdit,
}: {
  row: ConsentLanguageState;
  onEdit: () => void;
}) {
  const t = useTranslations("consentDocuments");
  const sourceLabel = {
    db: t("sourceDb"),
    file: t("sourceFile"),
    missing: t("sourceMissing"),
  }[row.source];

  return (
    <tr>
      <td>{LANG_LABELS[row.lang] ?? row.lang}</td>
      <td>{sourceLabel}</td>
      <td>{row.version ?? "—"}</td>
      <td>{row.effectiveDate ?? "—"}</td>
      <td>
        {row.status === "published"
          ? t("statusPublished")
          : row.status === "draft"
            ? t("statusDraft")
            : "—"}
        {row.hasPlaceholders && (
          <>
            {" "}
            <span className={styles.badge}>{t("placeholders")}</span>
          </>
        )}
      </td>
      <td>
        <button type="button" className={styles.actionBtn} onClick={onEdit}>
          {t("edit")}
        </button>
      </td>
    </tr>
  );
}

function Editor({
  doc,
  problems,
  saving,
  showPreview,
  onTogglePreview,
  onChange,
  onSave,
  onRevert,
  onClose,
}: {
  doc: EditableConsentDocument;
  problems: string[];
  saving: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
  onChange: (patch: Partial<EditableConsentDocument>) => void;
  onSave: () => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("consentDocuments");
  const tc = useTranslations("common");

  const problemText = useMemo(
    () =>
      problems.map((p) =>
        ["body_too_short", "invalid_version", "invalid_effective_date", "invalid_status", "placeholders_remain"].includes(p)
          ? t(`problems.${p}`)
          : p,
      ),
    [problems, t],
  );

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>
          <span className={styles.code}>{doc.slug}</span> ·{" "}
          {t("editing", { lang: LANG_LABELS[doc.lang] ?? doc.lang })}
        </h2>

        {problemText.length > 0 && (
          <ul className={styles.error}>
            {problemText.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="cd-version">
            {t("version")}
          </label>
          <input
            id="cd-version"
            className={styles.input}
            value={doc.version}
            onChange={(e) => onChange({ version: e.target.value })}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="cd-date">
            {t("effectiveDate")}
          </label>
          <input
            id="cd-date"
            className={styles.input}
            value={doc.effectiveDate}
            onChange={(e) => onChange({ effectiveDate: e.target.value })}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="cd-binding">
            {t("bindingLanguage")}
          </label>
          <input
            id="cd-binding"
            className={styles.input}
            value={doc.bindingLanguage}
            onChange={(e) => onChange({ bindingLanguage: e.target.value })}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="cd-status">
            {tc("status")}
          </label>
          <select
            id="cd-status"
            className={styles.select}
            value={doc.status}
            onChange={(e) =>
              onChange({ status: e.target.value as DocumentStatus })
            }
          >
            <option value="draft">{t("statusDraft")}</option>
            <option value="published">{t("statusPublished")}</option>
          </select>
        </div>

        <div className={styles.detailSection}>
          <span className={styles.detailLabel}>{t("body")}</span>
          {showPreview ? (
            <pre className={styles.detailText}>{doc.body}</pre>
          ) : (
            <textarea
              aria-label={t("body")}
              className={styles.input}
              rows={18}
              style={{ width: "100%", fontFamily: "monospace" }}
              value={doc.body}
              onChange={(e) => onChange({ body: e.target.value })}
            />
          )}
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onTogglePreview}
          >
            {showPreview ? t("edit") : t("preview")}
          </button>

          {/* Only offered when a shipped file exists AND is not already live —
              otherwise the button either does nothing or claims to restore
              something that is not there. */}
          {doc.fileAvailable && doc.source === "db" && (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onRevert}
            >
              {t("revert")}
            </button>
          )}
          {doc.fileAvailable && doc.fileBody !== null && (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => onChange({ body: doc.fileBody as string })}
            >
              {t("loadShipped")}
            </button>
          )}

          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
