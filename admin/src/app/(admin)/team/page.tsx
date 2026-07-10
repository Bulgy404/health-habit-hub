"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl } from "@/lib/api";
import { Modal } from "@/components/modal";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface Member {
  id: string;
  username: string;
  email: string | null;
  roles: string[];
}

interface SearchResult {
  id: string;
  username: string;
  email: string | null;
}

const MANAGEABLE_ROLES = ["admin", "researcher"];

/**
 * Team & Roles — surfaces and edits who holds the admin/researcher realm
 * roles, which otherwise live entirely in the Keycloak console with no
 * in-app visibility.
 */
export default function TeamPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl("/admin/team"), token);
      setMembers((data?.members ?? []) as Member[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSearch() {
    if (!token || !query.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch(
        apiUrl(`/admin/team/search?q=${encodeURIComponent(query.trim())}`),
        token
      );
      setResults((data?.users ?? []) as SearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("searchFailed"));
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant(userId: string, role: string) {
    if (!token) return;
    setBusyUserId(userId);
    try {
      await apiFetch(apiUrl(`/admin/team/${userId}/roles`), token, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setShowAdd(false);
      setQuery("");
      setResults([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("grantFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRevoke(userId: string, username: string, role: string) {
    if (!token) return;
    if (!window.confirm(t("revokeConfirm", { role: t(`role${cap(role)}`), username })))
      return;
    setBusyUserId(userId);
    try {
      await apiFetch(apiUrl(`/admin/team/${userId}/roles/${role}`), token, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("revokeFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button className={styles.addButton} onClick={() => setShowAdd(true)}>
          {t("addMember")}
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
                <th>{t("member")}</th>
                <th>{t("roles")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.username}
                    {m.email && <div className={styles.muted}>{m.email}</div>}
                  </td>
                  <td>
                    {m.roles.map((r) => (
                      <span key={r} className={styles.badge} style={{ marginRight: 6 }}>
                        {t(`role${cap(r)}`)}
                      </span>
                    ))}
                  </td>
                  <td>
                    {m.roles.map((r) => (
                      <button
                        key={r}
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        disabled={busyUserId === m.id}
                        onClick={() => handleRevoke(m.id, m.username, r)}
                        style={{ marginRight: 6 }}
                      >
                        {t("revoke")} {t(`role${cap(r)}`)}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    style={{ textAlign: "center", padding: "2rem" }}
                    className={styles.muted}
                  >
                    {t("noMembers")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
            <h2 className={styles.modalTitle}>{t("addMember")}</h2>
            <div className={styles.formRow}>
              <input
                className={styles.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button className={styles.actionBtn} onClick={handleSearch} disabled={searching}>
                {t("searchButton")}
              </button>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
              {results.map((u) => (
                <li
                  key={u.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <span>
                    {u.username}
                    {u.email && <span className={styles.muted}> ({u.email})</span>}
                  </span>
                  <span>
                    {MANAGEABLE_ROLES.map((role) => (
                      <button
                        key={role}
                        className={styles.actionBtn}
                        disabled={busyUserId === u.id}
                        onClick={() => handleGrant(u.id, role)}
                        style={{ marginLeft: 6 }}
                      >
                        {t(`grant${cap(role)}`)}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
              {results.length === 0 && !searching && query && (
                <li className={styles.muted}>{t("noSearchResults")}</li>
              )}
            </ul>

            <div className={styles.formActions}>
              <button className={styles.secondaryButton} onClick={() => setShowAdd(false)}>
                {tc("cancel")}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
