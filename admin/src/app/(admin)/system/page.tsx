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
  ListChecks,
  Layers,
  KeyRound,
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

const APP_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

// External tool URLs — configurable via NEXT_PUBLIC_* env vars with sensible
// local defaults so the portal is the single entry point to the whole stack.
// Tool names are product/brand names and are not translated.
const TOOLS: ToolLink[] = [
  {
    name: "Keycloak",
    descriptionKey: "keycloak",
    url: `${env(process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL, "http://localhost:8080")}/admin/master/console/#/hhh`,
    Icon: KeyRound,
  },
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
    name: "Bull Board",
    descriptionKey: "bullBoard",
    url: env(process.env.NEXT_PUBLIC_BULL_BOARD_URL, `${APP_ORIGIN}/admin/queues`),
    Icon: ListChecks,
  },
  {
    name: "RedisInsight",
    descriptionKey: "redisInsight",
    url: env(process.env.NEXT_PUBLIC_REDIS_INSIGHT_URL, "http://localhost:5540"),
    Icon: Layers,
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
    url: env(process.env.NEXT_PUBLIC_API_DOCS_URL, `${APP_ORIGIN}/api-docs`),
    Icon: FileJson,
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

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

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface RedisStats {
  connected: boolean;
  usedMemoryMB?: number;
  keyspaceHits?: number;
  keyspaceMisses?: number;
  hitRatePct?: number | null;
  totalKeys?: number;
  connectedClients?: number;
  uptimeSeconds?: number;
}

interface Queues {
  generatedAt: string;
  queues: { name: string; counts: QueueCounts }[];
  redis: RedisStats;
}

// Poll on a gentle cadence and only while the tab is visible — a background
// widget must never burn the API rate-limit budget.
const REFRESH_MS = 30_000;

// Service labels are product/technical names — not translated.
const SERVICE_LABELS: Record<string, string> = {
  mongo: "MongoDB",
  neo4j: "Neo4j",
  keycloak: "Keycloak",
  recommender: "Recommender",
};

// Queue-count colours: pending/active are informational, failed is a problem.
const QUEUE_TONE: Record<keyof QueueCounts, "ok" | "err" | "neutral"> = {
  waiting: "neutral",
  active: "neutral",
  completed: "ok",
  failed: "err",
  delayed: "neutral",
  paused: "neutral",
};

// ── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * System hub — a live health dashboard (downstream services, Prometheus
 * metrics, Bull/Redis pipeline) followed by quick links to the stack's tools.
 */
export default function SystemPage() {
  const { token } = useAdminGuard();
  const t = useTranslations("system");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [queues, setQueues] = useState<Queues | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [ov, q] = await Promise.all([
        apiFetch(apiUrl("/admin/system/overview"), token) as Promise<Overview>,
        apiFetch(apiUrl("/admin/system/queues"), token) as Promise<Queues>,
      ]);
      setOverview(ov);
      setQueues(q);
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

    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    timerRef.current = setInterval(tick, REFRESH_MS);

    // Refresh immediately when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, refresh]);

  const p = overview?.prometheus;
  const v = p?.values ?? {};
  const appUp = v.appUp === 1;
  const redis = queues?.redis;

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

      {/* ── Queues & cache (Bull / Redis) ──────────────────────────────────── */}
      <h2 className={styles.sectionTitle} style={{ marginTop: "1.75rem", marginBottom: "0.5rem" }}>
        Queues &amp; cache
      </h2>
      {queues ? (
        <>
          {queues.queues.map((q) => (
            <QueuePipeline key={q.name} name={q.name} counts={q.counts} />
          ))}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.75rem",
            }}
          >
            <StatCard
              Icon={Layers}
              label="Redis"
              value={redis?.connected ? "Connected" : "Down"}
              tone={redis?.connected ? "ok" : "err"}
            />
            <StatCard
              Icon={Gauge}
              label="Cache hit rate"
              value={fmt(redis?.hitRatePct ?? null, 1, "%")}
              tone={
                redis?.hitRatePct != null && redis.hitRatePct < 50 ? "err" : "neutral"
              }
            />
            <StatCard Icon={Database} label="Cached keys" value={fmt(redis?.totalKeys, 0)} />
            <StatCard Icon={Database} label="Redis memory" value={fmt(redis?.usedMemoryMB, 1, " MB")} />
            <StatCard Icon={Activity} label="Redis clients" value={fmt(redis?.connectedClients, 0)} />
          </div>
        </>
      ) : (
        !loading && <p className={styles.muted}>Queue &amp; cache stats unavailable.</p>
      )}

      {/* ── Tool links ─────────────────────────────────────────────────────── */}
      <h2 className={styles.sectionTitle} style={{ marginTop: "1.75rem", marginBottom: "0.5rem" }}>
        Tools &amp; links
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

// Ordered stages of the BullMQ pipeline, rendered left-to-right with arrows.
const PIPELINE_STAGES: (keyof QueueCounts)[] = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused",
];

const STAGE_LABELS: Record<keyof QueueCounts, string> = {
  waiting: "Waiting",
  active: "Active",
  delayed: "Delayed",
  completed: "Completed",
  failed: "Failed",
  paused: "Paused",
};

function QueuePipeline({ name, counts }: { name: string; counts: QueueCounts }) {
  return (
    <div className={styles.section} style={{ padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <ListChecks size={17} color="var(--color-primary)" />
        <span style={{ fontWeight: 600 }}>{name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "0.4rem", flexWrap: "wrap" }}>
        {PIPELINE_STAGES.map((stage, i) => {
          const tone = QUEUE_TONE[stage];
          const color =
            tone === "ok" ? "#16a34a" : tone === "err" ? "#dc2626" : "var(--color-primary)";
          const count = counts[stage] ?? 0;
          return (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <div
                style={{
                  minWidth: 84,
                  border: "1px solid var(--color-border, #e2e8f0)",
                  borderRadius: 8,
                  padding: "0.5rem 0.65rem",
                  textAlign: "center",
                  background: count > 0 && tone === "err" ? "#fef2f2" : "transparent",
                }}
              >
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color }}>{count}</div>
                <div className={styles.muted} style={{ fontSize: "0.72rem" }}>
                  {STAGE_LABELS[stage]}
                </div>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className={styles.muted} style={{ fontSize: "1rem" }}>
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
