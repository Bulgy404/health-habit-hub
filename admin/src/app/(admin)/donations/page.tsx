"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiUrl, API_BASE_URL } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface Donation {
  id: string;
  participantId: string;
  habitName: string;
  category: string;
  group: string | null;
  donatedAt: string | null;
}

interface FeedResult {
  total: number;
  page: number;
  limit: number;
  results: Donation[];
}

const PAGE_SIZE = 50;

function normalise(raw: unknown): Donation {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(j._id ?? j.id ?? ""),
    participantId: String(j.participantId ?? ""),
    habitName: String(j.habitName ?? ""),
    category: String(j.category ?? ""),
    group: j.group != null ? String(j.group) : null,
    donatedAt: j.donatedAt ? String(j.donatedAt) : null,
  };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/**
 * Donated-habits research feed with group/category/date filters, pagination,
 * and CSV export. Moved here from the mobile admin section.
 */
export default function DonationsPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("donations");
  const tc = useTranslations("common");
  const [feed, setFeed] = useState<FeedResult>({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    results: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce the category text box so typing doesn't trigger a fetch (and a
  // full Neo4j re-scan) on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(1);
      setCategory(categoryInput);
    }, 300);
    return () => clearTimeout(handle);
  }, [categoryInput]);

  function buildQuery(): string {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (group) params.set("group", group);
    if (category) params.set("category", category);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl(`/admin/habits/feed?${buildQuery()}`), token);
      setFeed({
        total: Number(data?.total ?? 0),
        page: Number(data?.page ?? 1),
        limit: Number(data?.limit ?? PAGE_SIZE),
        results: ((data?.results ?? []) as unknown[]).map(normalise),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, group, category, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    if (!token) return;
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (group) params.set("group", group);
      if (category) params.set("category", category);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`${API_BASE_URL}/admin/habits/feed/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t("exportHttpFailed", { status: res.status }));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `habit-donations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exportFailed"));
    }
  }

  const totalPages = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button className={styles.addButton} onClick={handleExport}>
          {t("exportCsv")}
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("groupLabel")}</span>
          <select
            className={styles.select}
            value={group}
            onChange={(e) => {
              setPage(1);
              setGroup(e.target.value);
            }}
          >
            <option value="">{t("filterAll")}</option>
            <option value="G1">G1</option>
            <option value="G2">G2</option>
            <option value="G3">G3</option>
            <option value="G4">G4</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("categoryLabel")}</span>
          <input
            className={styles.input}
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            placeholder={t("categoryPlaceholder")}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("fromLabel")}</span>
          <input
            type="date"
            className={styles.input}
            value={dateFrom}
            onChange={(e) => {
              setPage(1);
              setDateFrom(e.target.value);
            }}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("toLabel")}</span>
          <input
            type="date"
            className={styles.input}
            value={dateTo}
            onChange={(e) => {
              setPage(1);
              setDateTo(e.target.value);
            }}
          />
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>{tc("loading")}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("habitHeader")}</th>
                  <th>{t("categoryLabel")}</th>
                  <th>{t("groupLabel")}</th>
                  <th>{t("participantHeader")}</th>
                  <th>{t("donatedHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {feed.results.map((d) => (
                  <tr key={d.id}>
                    <td>{d.habitName || "—"}</td>
                    <td>{d.category ? <span className={styles.badge}>{d.category}</span> : "—"}</td>
                    <td>{d.group ?? "—"}</td>
                    <td>
                      <span className={styles.code}>{d.participantId || "—"}</span>
                    </td>
                    <td>{fmt(d.donatedAt)}</td>
                  </tr>
                ))}
                {feed.results.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", padding: "2rem" }}
                      className={styles.muted}
                    >
                      {t("noMatch")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.muted}>
              {t("totalPageInfo", { total: feed.total, page, totalPages })}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {tc("previous")}
            </button>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              {tc("next")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
