"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  "/admin/profile-field-definitions";

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
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("profileFields");
  const tc = useTranslations("common");
  const [defs, setDefs] = useState<ProfileFieldDefinition[]>([]);
  const [form, setForm] = useState<ProfileFieldDefinition>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
      return;
    }
    if (!session.accessToken) return;
    apiFetch(API_BASE, session.accessToken)
      .then(setDefs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session, status, router]);

  async function handleSave() {
    if (!session?.accessToken) return;
    setError(null);
    try {
      if (editingId) {
        const { label, type, options, required, order } = form;
        const updated = await apiFetch(`${API_BASE}/${editingId}`, session.accessToken, {
          method: "PUT",
          body: JSON.stringify({ label, type, options, required, order }),
        });
        setDefs(defs.map((d) => (d.fieldId === editingId ? updated : d)));
      } else {
        const created = await apiFetch(API_BASE, session.accessToken, {
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
    }
  }

  async function handleDelete(fieldId: string) {
    if (!session?.accessToken || !confirm(t("confirmDelete", { fieldId }))) return;
    try {
      await apiFetch(`${API_BASE}/${fieldId}`, session.accessToken, { method: "DELETE" });
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
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
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
            <button className={styles.saveButton} onClick={handleSave}>
              {editingId ? tc("save") : t("create")}
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
