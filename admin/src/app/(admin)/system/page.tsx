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
import styles from "./page.module.css";

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
    url: env(process.env.NEXT_PUBLIC_GRAFANA_URL, "http://grafana.localhost"),
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

const PIPELINE_STAGES: (keyof QueueCounts)[] = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused",
];

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
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

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

  const downServices = overview
    ? Object.entries(overview.health.services).filter(([, s]) => s.status !== "ok")
    : [];
  const errorRate = v.errorRatePct ?? 0;

  let bannerTone: "ok" | "warn" | "err" = "ok";
  let bannerText = t("banner.allOperational");
  if (downServices.length > 0) {
    bannerTone = "err";
    bannerText = t("banner.servicesDown", { count: downServices.length });
  } else if (p && !p.reachable) {
    bannerTone = "warn";
    bannerText = t("banner.metricsUnavailable");
  } else if (errorRate > 5) {
    bannerTone = "warn";
    bannerText = t("banner.elevatedErrorRate", { rate: fmt(errorRate, 1) });
  }

  const bannerClass = {
    ok: styles.bannerOk,
    warn: styles.bannerWarn,
    err: styles.bannerErr,
  }[bannerTone];
  const BannerIcon = bannerTone === "ok" ? CheckCircle2 : bannerTone === "warn" ? AlertTriangle : XCircle;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>
            {t.rich("subtitle", { code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>
        <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
          <RefreshCw size={15} />
          {t("refresh")}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* ── System health ───────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t("systemHealth")}</h2>
          {overview && (
            <span className={styles.sectionMeta}>
              {t("updatedAt", { time: new Date(overview.generatedAt).toLocaleTimeString() })}
            </span>
          )}
        </div>

        {loading && !overview ? (
          <p className={styles.loading}>{t("loadingEllipsis")}</p>
        ) : (
          overview && (
            <>
              <div className={`${styles.banner} ${bannerClass}`}>
                <BannerIcon size={18} />
                <span className={styles.bannerTitle}>{bannerText}</span>
              </div>

              <div className={styles.cardGrid}>
                {/* Downstream services overview card */}
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Activity size={16} color="var(--color-primary)" />
                    <span className={styles.cardTitle}>{t("services")}</span>
                    <span
                      className={`${styles.cardBadge} ${downServices.length === 0 ? styles.badgeOk : styles.badgeErr}`}
                    >
                      {downServices.length === 0
                        ? t("healthy")
                        : t("issuesCount", { count: downServices.length })}
                    </span>
                  </div>
                  <div className={styles.serviceGrid}>
                    {Object.entries(overview.health.services).map(([key, s]) => (
                      <div key={key} className={styles.serviceCard}>
                        <div className={styles.serviceName}>
                          {s.status === "ok" ? (
                            <CheckCircle2 size={16} color="var(--color-success)" />
                          ) : (
                            <XCircle size={16} color="var(--color-error)" />
                          )}
                          {SERVICE_LABELS[key] ?? key}
                        </div>
                        <div className={styles.serviceMeta}>
                          {s.status === "ok" ? t("healthy") : t("unreachable")} · {s.latencyMs} ms
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance overview card */}
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Gauge size={16} color="var(--color-primary)" />
                    <span className={styles.cardTitle}>{t("performance")}</span>
                    {p && !p.reachable && (
                      <span className={`${styles.cardBadge} ${styles.badgeWarn}`}>
                        {t("unavailable")}
                      </span>
                    )}
                  </div>
                  {p && !p.reachable ? (
                    <p className={styles.emptyNote}>{t("prometheusUnreachable")}</p>
                  ) : (
                    <div className={styles.statGrid}>
                      <Stat
                        Icon={Activity}
                        label={t("stats.appTarget")}
                        value={appUp ? t("up") : t("down")}
                        tone={appUp ? "ok" : "err"}
                      />
                      <Stat Icon={Gauge} label={t("stats.requestsPerSec")} value={fmt(v.requestsPerSec, 2)} />
                      <Stat
                        Icon={AlertTriangle}
                        label={t("stats.errorRate")}
                        value={fmt(v.errorRatePct, 2, "%")}
                        tone={errorRate > 5 ? "err" : undefined}
                      />
                      <Stat Icon={Timer} label={t("stats.p95Latency")} value={fmt(v.p95LatencyMs, 0, " ms")} />
                      <Stat Icon={Cpu} label={t("stats.cpu")} value={fmt(v.cpuPercent, 1, "%")} />
                      <Stat
                        Icon={Database}
                        label={t("stats.memoryRss")}
                        value={fmt(v.residentMemoryMB, 0, " MB")}
                      />
                      <Stat
                        Icon={Timer}
                        label={t("stats.eventLoopLag")}
                        value={fmt(v.eventLoopLagMs, 1, " ms")}
                      />
                      <Stat Icon={Database} label={t("stats.heapUsed")} value={fmt(v.heapUsedMB, 0, " MB")} />
                    </div>
                  )}
                </div>

                {/* Queues & cache overview card */}
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Layers size={16} color="var(--color-primary)" />
                    <span className={styles.cardTitle}>{t("queuesAndCache")}</span>
                    {redis && (
                      <span
                        className={`${styles.cardBadge} ${redis.connected ? styles.badgeOk : styles.badgeErr}`}
                      >
                        {redis.connected ? t("connected") : t("down")}
                      </span>
                    )}
                  </div>
                  {queues ? (
                    <>
                      {queues.queues.map((q) => (
                        <QueuePipeline key={q.name} name={q.name} counts={q.counts} />
                      ))}
                      <div className={styles.statGrid}>
                        <Stat
                          Icon={Gauge}
                          label={t("stats.cacheHitRate")}
                          value={fmt(redis?.hitRatePct ?? null, 1, "%")}
                          tone={
                            redis?.hitRatePct != null && redis.hitRatePct < 50 ? "err" : undefined
                          }
                        />
                        <Stat Icon={Database} label={t("stats.cachedKeys")} value={fmt(redis?.totalKeys, 0)} />
                        <Stat
                          Icon={Database}
                          label={t("stats.redisMemory")}
                          value={fmt(redis?.usedMemoryMB, 1, " MB")}
                        />
                        <Stat
                          Icon={Activity}
                          label={t("stats.redisClients")}
                          value={fmt(redis?.connectedClients, 0)}
                        />
                      </div>
                    </>
                  ) : (
                    <p className={styles.emptyNote}>{t("queueStatsUnavailable")}</p>
                  )}
                </div>
              </div>
            </>
          )
        )}
      </section>

      {/* ── Tools ───────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t("tools")}</h2>
        </div>
        <div className={styles.toolGrid}>
          {TOOLS.map((tool) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.toolCard}
            >
              <div className={styles.toolHead}>
                <tool.Icon size={20} color="var(--color-primary)" />
                <span className={styles.toolName}>{tool.name}</span>
                <ExternalLink size={14} className={styles.toolExternal} />
              </div>
              <div className={styles.toolDescription}>{t(`descriptions.${tool.descriptionKey}`)}</div>
              <div className={styles.toolUrl}>{tool.url}</div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Stat({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  tone?: "ok" | "err";
}) {
  const valueClass =
    tone === "ok" ? styles.statValueOk : tone === "err" ? styles.statValueErr : "";
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>
        <Icon size={13} />
        {label}
      </span>
      <span className={`${styles.statValue} ${valueClass}`}>{value}</span>
    </div>
  );
}

const STAGE_LABEL_KEYS: Record<keyof QueueCounts, string> = {
  waiting: "waiting",
  active: "active",
  delayed: "delayed",
  completed: "completed",
  failed: "failed",
  paused: "paused",
};

function QueuePipeline({ name, counts }: { name: string; counts: QueueCounts }) {
  const t = useTranslations("system");
  return (
    <div className={styles.pipeline}>
      <div className={styles.pipelineName}>
        <ListChecks size={15} color="var(--color-primary)" />
        {name}
      </div>
      <div className={styles.pipelineRow}>
        {PIPELINE_STAGES.map((stage, i) => {
          const tone = QUEUE_TONE[stage];
          const count = counts[stage] ?? 0;
          return (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <div
                className={`${styles.pipelineStage} ${count > 0 && tone === "err" ? styles.pipelineStageErr : ""}`}
              >
                <div
                  className={styles.pipelineCount}
                  style={{ color: tone === "err" && count > 0 ? "var(--color-error)" : "var(--color-text)" }}
                >
                  {count}
                </div>
                <div className={styles.pipelineLabel}>{t(`stages.${STAGE_LABEL_KEYS[stage]}`)}</div>
              </div>
              {i < PIPELINE_STAGES.length - 1 && <span className={styles.pipelineArrow}>→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
