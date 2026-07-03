"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl, API_BASE_URL } from "@/lib/api";
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const [feed, setFeed] = useState<FeedResult>({ total: 0, page: 1, limit: PAGE_SIZE, results: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const token = session?.accessToken;

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
      setError(e instanceof Error ? e.message : "Failed to load donations");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, group, category, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
      return;
    }
    load();
  }, [session, status, router, load]);

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
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
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
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Habit Donations</h1>
          <p className={styles.subtitle}>
            Donated habits across participants. Filter and export for analysis.
          </p>
        </div>
        <button className={styles.addButton} onClick={handleExport}>
          Export CSV
        </button>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Group</span>
          <select
            className={styles.select}
            value={group}
            onChange={(e) => { setPage(1); setGroup(e.target.value); }}
          >
            <option value="">All</option>
            <option value="G1">G1</option>
            <option value="G2">G2</option>
            <option value="G3">G3</option>
            <option value="G4">G4</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Category</span>
          <input
            className={styles.input}
            value={category}
            onChange={(e) => { setPage(1); setCategory(e.target.value); }}
            placeholder="e.g. Physical activity"
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>From</span>
          <input type="date" className={styles.input} value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>To</span>
          <input type="date" className={styles.input} value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Habit</th>
                  <th>Category</th>
                  <th>Group</th>
                  <th>Participant</th>
                  <th>Donated</th>
                </tr>
              </thead>
              <tbody>
                {feed.results.map((d) => (
                  <tr key={d.id}>
                    <td>{d.habitName || "—"}</td>
                    <td>{d.category ? <span className={styles.badge}>{d.category}</span> : "—"}</td>
                    <td>{d.group ?? "—"}</td>
                    <td><span className={styles.code}>{d.participantId || "—"}</span></td>
                    <td>{fmt(d.donatedAt)}</td>
                  </tr>
                ))}
                {feed.results.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }} className={styles.muted}>
                      No donations match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.muted}>
              {feed.total} total · page {page} of {totalPages}
            </span>
            <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </button>
            <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
