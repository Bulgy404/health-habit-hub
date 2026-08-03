"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { apiFetch, apiUrl } from "@/lib/api";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Spinner } from "@/components/spinner";
import styles from "./page.module.css";

const VALID_TYPES = ["text", "number", "date", "select"] as const;
type FieldType = (typeof VALID_TYPES)[number];

interface ProfileFieldDefinition {
  fieldId: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  order: number;
}

const API_BASE = apiUrl("/admin/profile-field-definitions");

function emptyForm(): ProfileFieldDefinition {
  return { fieldId: "", label: "", type: "text", options: [], required: false, order: 0 };
}

/**
 * Displays and manages user profile field definitions that appear during
 * onboarding. Supports creating, editing, and deleting field definitions.
 *
 * @returns The profile fields management page.
 */
export default function ProfileFieldsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");
  const [defs, setDefs] = useState<ProfileFieldDefinition[]>([]);
  const [form, setForm] = useState<ProfileFieldDefinition>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch(API_BASE, token)
      .then(setDefs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave() {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      if (editingId) {
        const { label, type, options, required, order } = form;
        const updated = await apiFetch(`${API_BASE}/${editingId}`, token, {
          method: "PUT",
          body: JSON.stringify({ label, type, options, required, order }),
        });
        setDefs(defs.map((d) => (d.fieldId === editingId ? updated : d)));
      } else {
        const created = await apiFetch(API_BASE, token, {
          method: "POST",
          body: JSON.stringify(form),
        });
        setDefs([...defs, created]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(fieldId: string) {
    if (!token || !confirm(t("confirmDelete", { fieldId }))) return;
    try {
      await apiFetch(`${API_BASE}/${fieldId}`, token, { method: "DELETE" });
      setDefs(defs.filter((d) => d.fieldId !== fieldId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    }
  }

  function startEdit(def: ProfileFieldDefinition) {
    setForm({ ...def });
    setEditingId(def.fieldId);
    setShowForm(true);
  }

  function addOption() {
    if (!newOption.trim()) return;
    setForm({ ...form, options: [...form.options, newOption.trim()] });
    setNewOption("");
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button
          className={styles.addButton}
          onClick={() => {
            setForm(emptyForm());
            setEditingId(null);
            setShowForm(true);
          }}
        >
          {t("addField")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("labelColumn")}</th>
                <th>{t("fieldIdColumn")}</th>
                <th>{t("typeColumn")}</th>
                <th>{t("requiredColumn")}</th>
                <th>{t("orderColumn")}</th>
                <th>{tc("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={def.fieldId}>
                  <td>{def.label}</td>
                  <td>
                    <code>{def.fieldId}</code>
                  </td>
                  <td>{def.type}</td>
                  <td>{def.required ? tc("yes") : tc("no")}</td>
                  <td>{def.order}</td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.editBtn}`}
                      onClick={() => startEdit(def)}
                    >
                      {tc("edit")}
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDelete(def.fieldId)}
                    >
                      {tc("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {defs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      padding: "2rem",
                    }}
                  >
                    {t("emptyState")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className={styles.formSection}>
          <h2>{editingId ? t("editFieldTitle") : t("addFieldTitle")}</h2>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t("fieldIdColumn")}</label>
            <input
              className={styles.formInput}
              value={form.fieldId}
              onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
              disabled={!!editingId}
              placeholder={t("fieldIdPlaceholder")}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t("labelColumn")}</label>
            <input
              className={styles.formInput}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t("labelPlaceholder")}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t("typeColumn")}</label>
            <select
              className={styles.formSelect}
              value={form.type}
              onChange={(e) => {
                setForm({ ...form, type: e.target.value as FieldType, options: [] });
                setNewOption("");
              }}
            >
              {VALID_TYPES.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {fieldType}
                </option>
              ))}
            </select>
          </div>

          {form.type === "select" && (
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{t("optionsLabel")}</label>
              <div>
                {form.options.map((opt, i) => (
                  <div key={`${opt}-${i}`} className={styles.optionRow}>
                    <span>{opt}</span>
                    <button
                      onClick={() =>
                        setForm({ ...form, options: form.options.filter((_, j) => j !== i) })
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className={styles.addOptionRow}>
                  <input
                    className={styles.formInput}
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder={t("newOptionPlaceholder")}
                    onKeyDown={(e) => e.key === "Enter" && addOption()}
                  />
                  <button onClick={addOption}>{tc("add")}</button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t("requiredColumn")}</label>
            <ToggleSwitch
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
              aria-label={t("requiredColumn")}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>{t("orderColumn")}</label>
            <input
              className={styles.formInput}
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div className={styles.formActions}>
            <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
              {saving ? <Spinner /> : editingId ? tc("save") : t("create")}
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(emptyForm());
              }}
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
