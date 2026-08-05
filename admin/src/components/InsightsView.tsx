"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { apiFetch, apiUrl } from "@/lib/api";
import { SpinnerLabel } from "@/components/spinner";
import styles from "@/components/admin-page.module.css";

interface InsightMeta {
  key: string;
  title: string;
  description: string;
}

interface StatItem {
  label: string;
  value: number | string;
}

interface TableColumn {
  key: string;
  label: string;
}

interface InsightResult {
  type: "stats" | "table";
  items?: StatItem[];
  columns?: TableColumn[];
  rows?: Record<string, unknown>[];
}

interface InsightData {
  key: string;
  title: string;
  description: string;
  computedAt: string;
  cached: boolean;
  result: InsightResult;
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * A single insight card: loads its (cached) answer lazily and supports a
 * per-card refresh that forces a recompute on the backend.
 */
function InsightCard({ meta, token }: { meta: InsightMeta; token: string }) {
  const t = useTranslations("insights");
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const url = apiUrl(`/admin/insights/${meta.key}${refresh ? "?refresh=1" : ""}`);
        const d = (await apiFetch(url, token)) as InsightData;
        setData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [meta.key, token, t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const result = data?.result;

  return (
    <div className={styles.section}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div className={styles.sectionTitle}>{meta.title}</div>
          <div className={styles.muted} style={{ fontSize: "0.82rem" }}>
            {meta.description}
          </div>
        </div>
        <button
          className={styles.actionBtn}
          onClick={() => load(true)}
          disabled={loading}
          title={t("recomputeNow")}
        >
          <RefreshCw size={14} style={{ verticalAlign: "-2px" }} />{" "}
          <SpinnerLabel loading={loading} label={t("refresh")} />
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {result?.type === "stats" && result.items && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          {result.items.map((it) => (
            <div
              key={it.label}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "0.75rem",
              }}
            >
              <div
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: "var(--color-primary)",
                }}
              >
                {it.value}
              </div>
              <div className={styles.muted} style={{ fontSize: "0.78rem" }}>
                {it.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.type === "table" && result.columns && (
        <div className={styles.tableWrap} style={{ marginTop: "0.75rem" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(result.rows ?? []).map((row, i) => (
                <tr key={i}>
                  {result.columns!.map((c) => (
                    <td key={c.key}>{String(row[c.key] ?? "—")}</td>
                  ))}
                </tr>
              ))}
              {(result.rows ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={result.columns.length}
                    className={styles.muted}
                    style={{ textAlign: "center", padding: "1.5rem" }}
                  >
                    {t("noData")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className={styles.muted} style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
          {data.cached ? t("cached") : t("freshlyComputed")} · {fmtTime(data.computedAt)}
        </div>
      )}
    </div>
  );
}

/**
 * Insights view — a curated set of cross-database (MongoDB + Neo4j) questions.
 * Each answer is cached on the backend (Redis, TTL) and recomputed on demand.
 *
 * Rendered as a tab inside the combined Analytics dashboard. Access control is
 * handled by the parent (admin-only); this component only fetches data.
 */
export function InsightsView() {
  const { data: session } = useSession();
  const t = useTranslations("insights");
  const tc = useTranslations("common");
  const [metas, setMetas] = useState<InsightMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const token = (session as { accessToken?: string } | null)?.accessToken;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch(apiUrl("/admin/insights"), token)
      .then((d) => setMetas((d?.insights ?? []) as InsightMeta[]))
      .catch((e) => setError(e instanceof Error ? e.message : t("loadInsightsFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>
        <button className={styles.addButton} onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={16} style={{ verticalAlign: "-3px" }} /> {t("reloadAll")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <motion.p
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {tc("loading")}
        </motion.p>
      ) : (
        <motion.div
          key={nonce}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {metas.map((m) => (
            <InsightCard key={m.key} meta={m} token={token ?? ""} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

export default InsightsView;
