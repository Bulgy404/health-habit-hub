"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

interface StudyGroup {
  id: string;
  label: string;
  index: number;
}

interface StudySummaryForAnalytics {
  id: string;
  groups: StudyGroup[];
}

interface WeeklyActiveRate {
  groupId: string;
  enrolled: number;
  active: number;
  rate: number;
}

interface SrhiPoint {
  groupId: string;
  weekNumber: number;
  meanScore: number;
  count: number;
}

interface DropoutPoint {
  groupId: string;
  date: string;
  cumulative: number;
}

interface AnalyticsData {
  weeklyActiveRate: WeeklyActiveRate[];
  srhiTrajectory: SrhiPoint[];
  dropoutCurve: DropoutPoint[];
}

const ANALYTICS_BASE = (studyId: string) =>
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1") +
  `/admin/studies/${studyId}/analytics`;

async function apiFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const GROUP_COLORS = ["#45B700", "#E679AB", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

export function AnalyticsTab({
  study,
  token,
}: {
  study: StudySummaryForAnalytics;
  token: string;
}) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(ANALYTICS_BASE(study.id), token)
      .then((d) => { if (!cancelled) setData(d as AnalyticsData); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [study.id, token]);

  const groupLabel = (gid: string) =>
    study.groups.find((g) => g.id === gid)?.label ?? gid;

  if (loading) return <div className={styles.loadingState}>Loading…</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;
  if (!data) return null;

  const maxRate = Math.max(...data.weeklyActiveRate.map((r) => r.rate), 0.01);

  const srhiByGroup: Record<string, SrhiPoint[]> = {};
  for (const p of data.srhiTrajectory) {
    srhiByGroup[p.groupId] = srhiByGroup[p.groupId] ?? [];
    srhiByGroup[p.groupId].push(p);
  }
  const weeks = [...new Set(data.srhiTrajectory.map((p) => p.weekNumber))].sort((a, b) => a - b);

  return (
    <div className={styles.analyticsTab}>
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>Weekly Active Rate</p>
        <p className={styles.analyticsSectionDesc}>% of enrolled participants with ≥1 log in the last 7 days.</p>
        {data.weeklyActiveRate.length === 0 ? (
          <div className={styles.emptyState}>No enrollment data yet.</div>
        ) : (
          <div className={styles.barChart}>
            {data.weeklyActiveRate.map((r, i) => (
              <div key={r.groupId} className={styles.barRow}>
                <span className={styles.barLabel}>{groupLabel(r.groupId)}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(r.rate / maxRate) * 100}%`, background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                  />
                </div>
                <span className={styles.barValue}>{Math.round(r.rate * 100)}%</span>
                <span className={styles.barSub}>({r.active}/{r.enrolled})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>SRHI Trajectory</p>
        <p className={styles.analyticsSectionDesc}>Mean habit strength score per week per condition (1–7 scale).</p>
        {data.srhiTrajectory.length === 0 ? (
          <div className={styles.emptyState}>No SRHI data yet.</div>
        ) : (
          <div className={styles.lineChartWrap}>
            <svg viewBox={`0 0 ${Math.max(weeks.length * 60 + 50, 300)} 160`} className={styles.lineChart}>
              {[1, 2, 3, 4, 5, 6, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return <line key={y} x1="40" y1={cy} x2={Math.max(weeks.length * 60 + 50, 300) - 10} y2={cy} stroke="#e5e7eb" strokeWidth="1" />;
              })}
              {[1, 4, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return <text key={y} x="32" y={cy + 4} textAnchor="end" fontSize="10" fill="#6b7280">{y}</text>;
              })}
              {weeks.map((w, i) => (
                <text key={w} x={40 + i * 60} y="158" textAnchor="middle" fontSize="10" fill="#6b7280">W{w}</text>
              ))}
              {Object.entries(srhiByGroup).map(([gid, points], gi) => {
                const sorted = [...points].sort((a, b) => a.weekNumber - b.weekNumber);
                const pts = sorted.map((p) => {
                  const xi = weeks.indexOf(p.weekNumber);
                  return `${40 + xi * 60},${140 - ((p.meanScore - 1) / 6) * 120}`;
                });
                const color = GROUP_COLORS[gi % GROUP_COLORS.length];
                return (
                  <g key={gid}>
                    <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" />
                    {sorted.map((p, i) => {
                      const xi = weeks.indexOf(p.weekNumber);
                      return <circle key={i} cx={40 + xi * 60} cy={140 - ((p.meanScore - 1) / 6) * 120} r="4" fill={color} />;
                    })}
                  </g>
                );
              })}
            </svg>
            <div className={styles.chartLegend}>
              {Object.keys(srhiByGroup).map((gid, i) => (
                <span key={gid} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                  {groupLabel(gid)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>Cumulative Dropout</p>
        <p className={styles.analyticsSectionDesc}>Participants marked as dropped out over time.</p>
        {data.dropoutCurve.length === 0 ? (
          <div className={styles.emptyState}>No dropouts recorded.</div>
        ) : (
          <div className={styles.dropoutList}>
            {data.dropoutCurve.map((p, i) => (
              <div key={i} className={styles.dropoutRow}>
                <span className={styles.dropoutDate}>{p.date}</span>
                <span className={styles.dropoutGroup}>{groupLabel(p.groupId)}</span>
                <span className={styles.dropoutCount}>cumulative: {p.cumulative}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
