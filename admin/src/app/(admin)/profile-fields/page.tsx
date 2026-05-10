"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
    const err = new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

function emptyForm(): ProfileFieldDefinition {
  return { fieldId: "", label: "", type: "text", options: [], required: false, order: 0 };
}

export default function ProfileFieldsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
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
      setError(e instanceof Error ? e.message : "Error saving");
    }
  }

  async function handleDelete(fieldId: string) {
    if (!session?.accessToken || !confirm(`Delete field '${fieldId}'?`)) return;
    try {
      await apiFetch(`${API_BASE}/${fieldId}`, session.accessToken, { method: "DELETE" });
      setDefs(defs.filter((d) => d.fieldId !== fieldId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
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
          <h1 className={styles.title}>Profile Fields</h1>
          <p className={styles.subtitle}>
            Configure which fields appear in the onboarding profile setup.
          </p>
        </div>
        <button className={styles.addButton} onClick={() => { setForm(emptyForm()); setEditingId(null); setShowForm(true); }}>
          + Add Field
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Label</th>
                <th>Field ID</th>
                <th>Type</th>
                <th>Required</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((def) => (
                <tr key={def.fieldId}>
                  <td>{def.label}</td>
                  <td><code>{def.fieldId}</code></td>
                  <td>{def.type}</td>
                  <td>{def.required ? "Yes" : "No"}</td>
                  <td>{def.order}</td>
                  <td>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => startEdit(def)}>Edit</button>
                    <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(def.fieldId)}>Delete</button>
                  </td>
                </tr>
              ))}
              {defs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "2rem" }}>No profile fields defined yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className={styles.formSection}>
          <h2>{editingId ? "Edit Field" : "Add Field"}</h2>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Field ID</label>
            <input
              className={styles.formInput}
              value={form.fieldId}
              onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
              disabled={!!editingId}
              placeholder="e.g. birthday (lowercase, underscores only)"
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Label</label>
            <input
              className={styles.formInput}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Shown to the user"
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Type</label>
            <select
              className={styles.formSelect}
              value={form.type}
              onChange={(e) => {
                setForm({ ...form, type: e.target.value as FieldType, options: [] });
                setNewOption("");
              }}
            >
              {VALID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {form.type === "select" && (
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Options</label>
              <div>
                {form.options.map((opt, i) => (
                  <div key={`${opt}-${i}`} className={styles.optionRow}>
                    <span>{opt}</span>
                    <button onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                <div className={styles.addOptionRow}>
                  <input
                    className={styles.formInput}
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="New option"
                    onKeyDown={(e) => e.key === "Enter" && addOption()}
                  />
                  <button onClick={addOption}>Add</button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Required</label>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Order</label>
            <input
              className={styles.formInput}
              type="number"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div className={styles.formActions}>
            <button className={styles.saveButton} onClick={handleSave}>
              {editingId ? "Save" : "Create"}
            </button>
            <button className={styles.cancelButton} onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
