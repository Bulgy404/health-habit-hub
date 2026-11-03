"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, apiUrl, API_BASE_URL } from "@/lib/api";
import { useSession } from "next-auth/react";
import { Download, FileDown } from "lucide-react";
import local from "./donations.module.css";
import { DonationDetailModal } from "./DonationDetailModal";
import styles from "@/components/admin-page.module.css";

interface Donation {
  id: string;
  participantId: string;
  habitName: string;
  category: string;
  group: string | null;
  studyId: string | null;
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
    studyId: j.studyId ? String(j.studyId) : null,
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
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";
  const t = useTranslations("donations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [feed, setFeed] = useState<FeedResult>({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    results: [],
  });
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [studyId, setStudyId] = useState("");
  const [studies, setStudies] = useState<
    { id: string; name: string; groups: string[]; canExport: boolean }[]
  >([]);
  const [exporting, setExporting] = useState(false);
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch(apiUrl("/admin/habit-donations/studies"), token)
      .then((data) => {
        if (!cancelled) setStudies(data.studies ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The category filter is a dropdown of the actual BCIO labels in use
  // (localised to the admin's own language), not free text — a substring/
  // fuzzy search over category names was unreliable since admins couldn't
  // know the exact wording the classifier assigned.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch(
      apiUrl(
        `/admin/habits/categories?${new URLSearchParams({ lang: locale, ...(studyId ? { studyId } : {}) })}`
      ),
      token
    )
      .then((data) => {
        if (!cancelled) setCategories((data?.categories ?? []) as string[]);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, locale, studyId]);

  function buildQuery(): string {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      lang: locale,
    });
    if (studyId) params.set("studyId", studyId);
    if (group) params.set("group", group);
    if (category) params.set("category", category);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }

  const load = useCallback(async () => {
    if (!token) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const data = await apiFetch(apiUrl(`/admin/habits/feed?${buildQuery()}`), token);
      if (currentRequest !== requestId.current) return;
      setFeed({
        total: Number(data?.total ?? 0),
        page: Number(data?.page ?? 1),
        limit: Number(data?.limit ?? PAGE_SIZE),
        results: ((data?.results ?? []) as unknown[]).map(normalise),
      });
      setError(null);
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setFeed({ total: 0, page: 1, limit: PAGE_SIZE, results: [] });
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, studyId, page, group, category, dateFrom, dateTo, locale]);

  useEffect(() => {
    const generation = requestId;
    load();
    return () => {
      generation.current++;
    };
  }, [load]);

  async function handleExport(format: "csv" | "zip") {
    if (!token) return;
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ format, lang: locale });
      if (studyId) params.set("studyId", studyId);
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
      a.download = `habit-donations-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  const selectedStudy = studies.find((s) => s.id === studyId);
  const canExport =
    session?.roles?.includes("admin") ||
    (studyId ? selectedStudy?.canExport : studies.length > 0 && studies.every((s) => s.canExport));
  const groups = [...new Set((selectedStudy ? [selectedStudy] : studies).flatMap((s) => s.groups))];
  const totalPages = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
      </div>

      <section className={local.downloadPanel} aria-label={t("downloadTitle")}>
        <div>
          <h2>{t("downloadTitle")}</h2>
          <p>{t("downloadHelp")}</p>
          {!canExport && <p>{t("exportPermission")}</p>}
        </div>
        <div className={local.downloadActions}>
          <button
            className={styles.secondaryButton}
            disabled={exporting || !canExport}
            onClick={() => handleExport("csv")}
          >
            <FileDown size={18} aria-hidden="true" />
            {t("exportCsv")}
          </button>
          <button
            className={styles.addButton}
            disabled={exporting || !canExport}
            onClick={() => handleExport("zip")}
          >
            <Download size={18} aria-hidden="true" />
            {t(exporting ? "preparing" : "downloadZip")}
          </button>
        </div>
      </section>
      <div className={styles.filters}>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("studyLabel")}</span>
          <select
            className={styles.select}
            value={studyId}
            onChange={(e) => {
              setPage(1);
              setStudyId(e.target.value);
              setGroup("");
              setCategory("");
            }}
          >
            <option value="">{t("allStudies")}</option>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterGroup}>
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
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("categoryLabel")}</span>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
          >
            <option value="">{t("filterAll")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterGroup}>
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
        </label>
        <label className={styles.filterGroup}>
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
        </label>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setPage(1);
            setStudyId("");
            setGroup("");
            setCategory("");
            setDateFrom("");
            setDateTo("");
          }}
        >
          {t("resetFilters")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("habitHeader")}</th>
                <th>{t("categoryLabel")}</th>
                <th>{t("studyLabel")}</th>
                <th>{t("groupLabel")}</th>
                <th>{t("participantHeader")}</th>
                <th>{t("donatedHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}>
                      <span className={styles.skeletonBar} style={{ width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("habitHeader")}</th>
                  <th>{t("categoryLabel")}</th>
                  <th>{t("studyLabel")}</th>
                  <th>{t("groupLabel")}</th>
                  <th>{t("participantHeader")}</th>
                  <th>{t("donatedHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {feed.results.map((d) => (
                  <tr
                    key={d.id}
                    className={styles.clickableRow}
                    onClick={() => setSelectedUuid(d.id)}
                  >
                    <td>
                      <button className={local.habitButton} onClick={() => setSelectedUuid(d.id)}>
                        {d.habitName || "—"}
                      </button>
                    </td>
                    <td>{d.category ? <span className={styles.badge}>{d.category}</span> : "—"}</td>
                    <td>
                      {studies.find((s) => s.id === d.studyId)?.name ?? d.studyId ?? t("noStudy")}
                    </td>
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
                      colSpan={6}
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

      {selectedUuid && token && (
        <DonationDetailModal
          uuid={selectedUuid}
          token={token}
          canExport={
            session?.roles?.includes("admin") ||
            studies.some(
              (s) =>
                s.id === feed.results.find((d) => d.id === selectedUuid)?.studyId && s.canExport
            )
          }
          onClose={() => setSelectedUuid(null)}
        />
      )}
    </div>
  );
}
