"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Activity,
  Share2,
  Database,
  FileJson,
  ExternalLink,
  RefreshCw,
  Cpu,
  Timer,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { API_BASE_URL, apiUrl, apiFetch } from "@/lib/api";
import { useAdminGuard } from "@/lib/useAdminGuard";
import styles from "@/components/admin-page.module.css";

interface ToolLink {
  name: string;
  descriptionKey: string;
  url: string;
  Icon: LucideIcon;
}

const env = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

// External tool URLs — configurable via NEXT_PUBLIC_* env vars with sensible
// local defaults so the portal is the single entry point to the whole stack.
// Tool names are product/brand names and are not translated.
const TOOLS: ToolLink[] = [
  {
    name: "Grafana",
    descriptionKey: "grafana",
    url: env(process.env.NEXT_PUBLIC_GRAFANA_URL, "http://localhost:3001"),
    Icon: BarChart3,
  },
  {
    name: "Prometheus",
    descriptionKey: "prometheus",
    url: env(process.env.NEXT_PUBLIC_PROMETHEUS_URL, "http://localhost:9090"),
    Icon: Activity,
  },
  {
    name: "Neo4j Browser",
    descriptionKey: "neo4jBrowser",
    url: env(process.env.NEXT_PUBLIC_NEO4J_BROWSER_URL, "http://localhost:7474"),
    Icon: Share2,
  },
  {
    name: "mongo-express",
    descriptionKey: "mongoExpress",
    url: env(process.env.NEXT_PUBLIC_MONGO_EXPRESS_URL, "http://localhost:8081"),
    Icon: Database,
  },
  {
    name: "API docs",
    descriptionKey: "apiDocs",
    url: env(
      process.env.NEXT_PUBLIC_API_DOCS_URL,
      `${API_BASE_URL.replace(/\/api\/v1$/, "")}/api-docs`
    ),
    Icon: FileJson,
  },
];

// ── System-health types ─────────────────────────────────────────────────────

interface ServiceStatus {
  status: "ok" | "error";
  latencyMs: number;
}

interface Overview {
  generatedAt: string;
  health: {
    status: "ok" | "error";
    services: Record<string, ServiceStatus>;
  };
  prometheus: {
    reachable: boolean;
    values: Record<string, number | null>;
  };
}

const REFRESH_MS = 10_000;

// Service labels are product/technical names — not translated.
const SERVICE_LABELS: Record<string, string> = {
  mongo: "MongoDB",
  neo4j: "Neo4j",
  keycloak: "Keycloak",
  recommender: "Recommender",
};

// ── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * System hub — a live health dashboard (downstream services + Prometheus
 * metrics) followed by quick links to the operational tools around the stack.
 */
export default function SystemPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("system");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = (await apiFetch(apiUrl("/admin/system/overview"), token)) as Overview;
      setOverview(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load system health");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refresh();
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, refresh]);

  const p = overview?.prometheus;
  const v = p?.values ?? {};
  const appUp = v.appUp === 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>
            {t.rich("subtitle", { code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          onClick={refresh}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* ── Live system health ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
          System health
        </h2>
        {overview && (
          <span className={styles.muted} style={{ fontSize: "0.75rem" }}>
            Updated {new Date(overview.generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && !overview ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        overview && (
          <>
            {/* Downstream service checks */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              {Object.entries(overview.health.services).map(([key, s]) => (
                <div key={key} className={styles.section} style={{ padding: "0.9rem 1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {s.status === "ok" ? (
                      <CheckCircle2 size={17} color="#16a34a" />
                    ) : (
                      <XCircle size={17} color="#dc2626" />
                    )}
                    <span style={{ fontWeight: 600 }}>{SERVICE_LABELS[key] ?? key}</span>
                  </div>
                  <div className={styles.muted} style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>
                    {s.status === "ok" ? "Healthy" : "Unreachable"} · {s.latencyMs} ms
                  </div>
                </div>
              ))}
            </div>

            {/* Prometheus metrics */}
            {p && !p.reachable ? (
              <div
                className={styles.section}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <AlertTriangle size={16} color="#d97706" />
                <span className={styles.muted} style={{ fontSize: "0.85rem" }}>
                  Prometheus is not reachable — metrics are temporarily unavailable.
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <StatCard
                  Icon={Activity}
                  label="App target"
                  value={appUp ? "Up" : "Down"}
                  tone={appUp ? "ok" : "err"}
                />
                <StatCard Icon={Gauge} label="Requests / sec" value={fmt(v.requestsPerSec, 2)} />
                <StatCard
                  Icon={AlertTriangle}
                  label="Error rate"
                  value={fmt(v.errorRatePct, 2, "%")}
                  tone={(v.errorRatePct ?? 0) > 5 ? "err" : "neutral"}
                />
                <StatCard Icon={Timer} label="p95 latency" value={fmt(v.p95LatencyMs, 0, " ms")} />
                <StatCard Icon={Cpu} label="CPU" value={fmt(v.cpuPercent, 1, "%")} />
                <StatCard Icon={Database} label="Memory (RSS)" value={fmt(v.residentMemoryMB, 0, " MB")} />
                <StatCard Icon={Timer} label="Event-loop lag" value={fmt(v.eventLoopLagMs, 1, " ms")} />
                <StatCard Icon={Database} label="Heap used" value={fmt(v.heapUsedMB, 0, " MB")} />
              </div>
            )}
          </>
        )
      )}

      {/* ── Tool links ─────────────────────────────────────────────────────── */}
      <h2 className={styles.sectionTitle} style={{ marginTop: "1.75rem", marginBottom: "0.5rem" }}>
        Tools & links
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {TOOLS.map((tool) => (
          <a
            key={tool.name}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.section}
            style={{ textDecoration: "none", display: "block" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <tool.Icon size={20} color="var(--color-primary)" />
              <span className={styles.sectionTitle} style={{ margin: 0 }}>
                {tool.name}
              </span>
              <ExternalLink size={14} className={styles.muted} style={{ marginLeft: "auto" }} />
            </div>
            <div className={styles.muted} style={{ fontSize: "0.82rem", marginTop: "0.4rem" }}>
              {t(`descriptions.${tool.descriptionKey}`)}
            </div>
            <div
              className={styles.code}
              style={{ fontSize: "0.72rem", marginTop: "0.5rem", wordBreak: "break-all" }}
            >
              {tool.url}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  Icon,
  label,
  value,
  tone = "neutral",
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  tone?: "ok" | "err" | "neutral";
}) {
  const color = tone === "ok" ? "#16a34a" : tone === "err" ? "#dc2626" : "var(--color-primary)";
  return (
    <div className={styles.section} style={{ padding: "0.9rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <Icon size={15} color={color} />
        <span className={styles.muted} style={{ fontSize: "0.78rem" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 700, marginTop: "0.3rem", color }}>
        {value}
      </div>
    </div>
  );
}
