"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Activity,
  Share2,
  Database,
  FileJson,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
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

/**
 * System hub — links out to the operational tools around the platform so the
 * admin portal is a single point of navigation.
 */
export default function SystemPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations("system");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.roles?.includes("admin")) {
      router.replace("/access-denied");
    }
  }, [session, status, router]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>
            {t.rich("subtitle", { code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>
      </div>

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
              style={{
                fontSize: "0.72rem",
                marginTop: "0.5rem",
                wordBreak: "break-all",
              }}
            >
              {tool.url}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
