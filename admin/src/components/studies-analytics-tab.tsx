"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiUrl } from "@/lib/api";
import styles from "../app/(admin)/studies/page.module.css";

interface StudyGroup {
  id: string;
  label: string;
  index: number;
}

export interface StudySummaryForAnalytics {
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

interface QuestionnaireCompletionRate {
  questionnaireId: string;
  slug: string;
  title: string;
  enrolled: number;
  completed: number;
  rate: number;
}

interface AnalyticsData {
  weeklyActiveRate: WeeklyActiveRate[];
  srhiTrajectory: SrhiPoint[];
  dropoutCurve: DropoutPoint[];
  questionnaireCompletionRates: QuestionnaireCompletionRate[];
}

interface Participant {
  id: string;
  username?: string;
  groupId?: string;
  groupLabel?: string;
  enrolledAt?: string | null;
  isActive?: boolean;
  droppedOut?: boolean;
}

interface Tooltip {
  x: number;
  y: number;
  lines: string[];
}

const ANALYTICS_BASE = (studyId: string) => apiUrl(`/admin/studies/${studyId}/analytics`);

// Study- and group-scoped (unlike /admin/participants, which has no
// study/group filter) — the drill-down panel needs exactly this study's
// (optionally this group's) roster, not every participant across the study.
const STUDY_PARTICIPANTS_URL = (studyId: string, groupId: string | null) =>
  apiUrl(`/admin/studies/${studyId}/participants?limit=500`) +
  (groupId ? `&groupId=${groupId}` : "");

const GROUP_COLORS = ["#45B700", "#E679AB", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444"];

/**
 * Authenticated JSON fetch helper (read-only, no request body).
 */
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

// ── Floating tooltip ──────────────────────────────────────────────────────────

function TooltipEl({ tip }: { tip: Tooltip }) {
  return (
    <div
      className={styles.tooltip}
      style={{ left: tip.x + 12, top: tip.y - 8, pointerEvents: "none" }}
    >
      {tip.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

// ── Drill-down participant panel ──────────────────────────────────────────────

function DrillPanel({
  title,
  studyId,
  groupId,
  token,
  onClose,
}: {
  title: string;
  studyId: string;
  groupId: string | null;
  token: string;
  onClose: () => void;
}) {
  const t = useTranslations("studies.analyticsTab");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(STUDY_PARTICIPANTS_URL(studyId, groupId), token)
      .then((d: { participants?: Record<string, unknown>[] }) => {
        if (!cancelled) {
          const list: Participant[] = (d.participants ?? []).map((p) => ({
            id: String(p.userId ?? ""),
            username: p.username ? String(p.username) : undefined,
            groupId: p.groupId ? String(p.groupId) : undefined,
            groupLabel: p.groupLabel ? String(p.groupLabel) : undefined,
            enrolledAt: p.enrolledAt ? String(p.enrolledAt) : null,
          }));
          setParticipants(list);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t("loadFailedShort"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studyId, groupId, token, t]);

  return (
    <div className={styles.drillPanel}>
      <div className={styles.drillPanelHeader}>
        <span className={styles.drillPanelTitle}>{title}</span>
        <button className={styles.drillPanelClose} onClick={onClose}>
          ×
        </button>
      </div>
      {loading ? (
        <div className={styles.drillLoading}>{t("loadingParticipants")}</div>
      ) : error ? (
        <div className={styles.drillLoading}>{error}</div>
      ) : participants.length === 0 ? (
        <div className={styles.drillLoading}>{t("noParticipantsFound")}</div>
      ) : (
        <table className={styles.drillTable}>
          <thead>
            <tr>
              <th>{t("columns.participant")}</th>
              <th>{t("columns.group")}</th>
              <th>{t("columns.enrolled")}</th>
              <th>{t("columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id}>
                <td
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {p.username ?? p.id.slice(0, 8)}
                </td>
                <td>{p.groupLabel ?? p.groupId ?? "—"}</td>
                <td>
                  {p.enrolledAt ? new Date(p.enrolledAt).toLocaleDateString() : "—"}
                </td>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.1rem 0.45rem",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      background: p.droppedOut
                        ? "#fee2e2"
                        : p.isActive
                        ? "#dcfce7"
                        : "#f3f4f6",
                      color: p.droppedOut
                        ? "#dc2626"
                        : p.isActive
                        ? "#16a34a"
                        : "#6b7280",
                    }}
                  >
                    {p.droppedOut
                      ? t("status.droppedOut")
                      : p.isActive
                      ? t("status.active")
                      : t("status.inactive")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main analytics tab ────────────────────────────────────────────────────────

/**
 * Displays analytics data for a study: weekly active rates, SRHI trajectory,
 * dropout curve, and questionnaire completion — with hover tooltips and
 * click-to-drill-down participant lists.
 */
export function AnalyticsTab({
  study,
  token,
}: {
  study: StudySummaryForAnalytics;
  token: string;
}) {
  const t = useTranslations("studies.analyticsTab");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [drill, setDrill] = useState<{
    title: string;
    groupId: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDrill(null);
    apiFetch(ANALYTICS_BASE(study.id), token)
      .then((d) => {
        if (!cancelled) setData(d as AnalyticsData);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [study.id, token, t]);

  const groupLabel = (gid: string) =>
    study.groups.find((g) => g.id === gid)?.label ?? gid;

  const showTip = (e: React.MouseEvent, lines: string[]) =>
    setTooltip({ x: e.clientX, y: e.clientY, lines });

  const hideTip = () => setTooltip(null);

  if (loading) return <div className={styles.loadingState}>{t("loadingAnalytics")}</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;
  if (!data) return null;

  const maxRate = Math.max(...data.weeklyActiveRate.map((r) => r.rate), 0.01);

  const srhiByGroup: Record<string, SrhiPoint[]> = {};
  for (const p of data.srhiTrajectory) {
    srhiByGroup[p.groupId] = srhiByGroup[p.groupId] ?? [];
    srhiByGroup[p.groupId].push(p);
  }
  const weeks = [
    ...new Set(data.srhiTrajectory.map((p) => p.weekNumber)),
  ].sort((a, b) => a - b);
  const svgW = Math.max(weeks.length * 60 + 60, 320);

  return (
    <div className={styles.analyticsTab} onMouseLeave={hideTip}>
      {tooltip && <TooltipEl tip={tooltip} />}

      {/* ── Weekly Active Rate ─────────────────────────────────────────────── */}
      <div className={styles.analyticsSection}>
        <div className={styles.analyticsSectionHeader}>
          <div>
            <p className={styles.analyticsSectionTitle}>{t("weeklyActiveRate.title")}</p>
            <p className={styles.analyticsSectionDesc}>
              {t("weeklyActiveRate.description")}
            </p>
          </div>
        </div>
        {data.weeklyActiveRate.length === 0 ? (
          <div className={styles.emptyState}>{t("weeklyActiveRate.empty")}</div>
        ) : (
          <>
            <div className={styles.barChart}>
              {data.weeklyActiveRate.map((r, i) => (
                <div
                  key={r.groupId}
                  className={`${styles.barRow} ${styles.barRowClickable}`}
                  onClick={() =>
                    setDrill({
                      title: t("weeklyActiveRate.drillTitle", { group: groupLabel(r.groupId) }),
                      groupId: r.groupId,
                    })
                  }
                  onMouseMove={(e) =>
                    showTip(e, [
                      t("tooltip.group", { group: groupLabel(r.groupId) }),
                      t("tooltip.activeOf", { active: r.active, enrolled: r.enrolled }),
                      t("tooltip.rate", { rate: Math.round(r.rate * 100) }),
                      t("tooltip.clickToSeeParticipants"),
                    ])
                  }
                  onMouseLeave={hideTip}
                >
                  <span
                    className={styles.barLabel}
                    title={groupLabel(r.groupId)}
                  >
                    {groupLabel(r.groupId)}
                  </span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${(r.rate / maxRate) * 100}%`,
                        background: GROUP_COLORS[i % GROUP_COLORS.length],
                      }}
                    />
                  </div>
                  <span className={styles.barValue}>
                    {Math.round(r.rate * 100)}%
                  </span>
                  <span className={styles.barSub}>
                    ({r.active}/{r.enrolled})
                  </span>
                </div>
              ))}
            </div>
            {drill && (
              <DrillPanel
                title={drill.title}
                studyId={study.id}
                groupId={drill.groupId}
                token={token}
                onClose={() => setDrill(null)}
              />
            )}
          </>
        )}
      </div>

      {/* ── SRHI Trajectory ───────────────────────────────────────────────── */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>{t("srhiTrajectory.title")}</p>
        <p className={styles.analyticsSectionDesc}>
          {t("srhiTrajectory.description")}
        </p>
        {data.srhiTrajectory.length === 0 ? (
          <div className={styles.emptyState}>{t("srhiTrajectory.empty")}</div>
        ) : (
          <div className={styles.lineChartWrap}>
            <svg
              viewBox={`0 0 ${svgW} 170`}
              className={`${styles.lineChart} ${styles.lineChartInteractive}`}
            >
              {/* Horizontal grid lines */}
              {[1, 2, 3, 4, 5, 6, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return (
                  <line
                    key={y}
                    x1="40"
                    y1={cy}
                    x2={svgW - 10}
                    y2={cy}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                );
              })}
              {/* Y-axis labels */}
              {[1, 4, 7].map((y) => {
                const cy = 140 - ((y - 1) / 6) * 120;
                return (
                  <text
                    key={y}
                    x="32"
                    y={cy + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#6b7280"
                  >
                    {y}
                  </text>
                );
              })}
              {/* Week labels */}
              {weeks.map((w, i) => (
                <text
                  key={w}
                  x={40 + i * 60}
                  y="158"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#6b7280"
                >
                  W{w}
                </text>
              ))}
              {/* Lines + interactive points */}
              {Object.entries(srhiByGroup).map(([gid, points], gi) => {
                const sorted = [...points].sort(
                  (a, b) => a.weekNumber - b.weekNumber
                );
                const color = GROUP_COLORS[gi % GROUP_COLORS.length];
                const coords = sorted.map((p) => {
                  const xi = weeks.indexOf(p.weekNumber);
                  return {
                    x: 40 + xi * 60,
                    y: 140 - ((p.meanScore - 1) / 6) * 120,
                    p,
                  };
                });
                return (
                  <g key={gid}>
                    <polyline
                      points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    {coords.map(({ x, y, p }, idx) => (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="5"
                        fill={color}
                        stroke="white"
                        strokeWidth="1.5"
                        onMouseMove={(e) =>
                          showTip(e, [
                            t("tooltip.group", { group: groupLabel(gid) }),
                            t("tooltip.week", { week: p.weekNumber }),
                            t("tooltip.meanSrhi", { score: p.meanScore.toFixed(2) }),
                            t("tooltip.responseCount", { count: p.count }),
                          ])
                        }
                        onMouseLeave={hideTip}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            <div className={styles.chartLegend}>
              {Object.keys(srhiByGroup).map((gid, i) => (
                <span key={gid} className={styles.legendItem}>
                  <span
                    className={styles.legendDot}
                    style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                  />
                  {groupLabel(gid)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Cumulative Dropout ────────────────────────────────────────────── */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>{t("cumulativeDropout.title")}</p>
        <p className={styles.analyticsSectionDesc}>
          {t("cumulativeDropout.description")}
        </p>
        {data.dropoutCurve.length === 0 ? (
          <div className={styles.emptyState}>{t("cumulativeDropout.empty")}</div>
        ) : (
          (() => {
            const sorted = [...data.dropoutCurve].sort((a, b) =>
              a.date.localeCompare(b.date)
            );
            const groupIds = [...new Set(sorted.map((p) => p.groupId))];
            const byGroup: Record<string, DropoutPoint[]> = {};
            for (const p of sorted) {
              byGroup[p.groupId] = byGroup[p.groupId] ?? [];
              byGroup[p.groupId].push(p);
            }
            const dates = [...new Set(sorted.map((p) => p.date))].sort();
            const maxCum = Math.max(...sorted.map((p) => p.cumulative), 1);
            const dW = Math.max(dates.length * 50 + 60, 320);
            return (
              <div className={styles.lineChartWrap}>
                <svg
                  viewBox={`0 0 ${dW} 170`}
                  className={`${styles.lineChart} ${styles.lineChartInteractive}`}
                >
                  {[0, Math.round(maxCum / 2), maxCum].map((v) => {
                    const cy = 140 - (v / maxCum) * 120;
                    return (
                      <g key={v}>
                        <line
                          x1="40"
                          y1={cy}
                          x2={dW - 10}
                          y2={cy}
                          stroke="#e5e7eb"
                          strokeWidth="1"
                        />
                        <text
                          x="32"
                          y={cy + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="#6b7280"
                        >
                          {v}
                        </text>
                      </g>
                    );
                  })}
                  {dates.map((d, i) => (
                    <text
                      key={d}
                      x={40 + i * 50}
                      y="158"
                      textAnchor="middle"
                      fontSize="9"
                      fill="#6b7280"
                    >
                      {d.slice(5)}
                    </text>
                  ))}
                  {groupIds.map((gid, gi) => {
                    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
                    const pts = (byGroup[gid] ?? []).sort((a, b) =>
                      a.date.localeCompare(b.date)
                    );
                    const coords = pts.map((p) => ({
                      x: 40 + dates.indexOf(p.date) * 50,
                      y: 140 - (p.cumulative / maxCum) * 120,
                      p,
                    }));
                    return (
                      <g key={gid}>
                        <polyline
                          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
                          fill="none"
                          stroke={color}
                          strokeWidth="2.5"
                          strokeDasharray="5 3"
                        />
                        {coords.map(({ x, y, p }, idx) => (
                          <circle
                            key={idx}
                            cx={x}
                            cy={y}
                            r="5"
                            fill={color}
                            stroke="white"
                            strokeWidth="1.5"
                            onMouseMove={(e) =>
                              showTip(e, [
                                t("tooltip.group", { group: groupLabel(gid) }),
                                t("tooltip.date", { date: p.date }),
                                t("tooltip.cumulativeDropouts", { count: p.cumulative }),
                              ])
                            }
                            onMouseLeave={hideTip}
                          />
                        ))}
                      </g>
                    );
                  })}
                </svg>
                <div className={styles.chartLegend}>
                  {groupIds.map((gid, i) => (
                    <span key={gid} className={styles.legendItem}>
                      <span
                        className={styles.legendDot}
                        style={{
                          background: GROUP_COLORS[i % GROUP_COLORS.length],
                        }}
                      />
                      {groupLabel(gid)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* ── Questionnaire Completion ──────────────────────────────────────── */}
      <div className={styles.analyticsSection}>
        <p className={styles.analyticsSectionTitle}>
          {t("questionnaireCompletion.title")}
        </p>
        <p className={styles.analyticsSectionDesc}>
          {t("questionnaireCompletion.description")}
        </p>
        {!data.questionnaireCompletionRates ||
        data.questionnaireCompletionRates.length === 0 ? (
          <div className={styles.emptyState}>
            {t("questionnaireCompletion.empty")}
          </div>
        ) : (
          <div className={styles.barChart}>
            {data.questionnaireCompletionRates.map((q, i) => (
              <div
                key={q.questionnaireId}
                className={`${styles.barRow} ${styles.barRowClickable}`}
                onMouseMove={(e) =>
                  showTip(e, [
                    q.title,
                    t("tooltip.completedOf", { completed: q.completed, enrolled: q.enrolled }),
                    t("tooltip.rate", { rate: Math.round(q.rate * 100) }),
                  ])
                }
                onMouseLeave={hideTip}
              >
                <span className={styles.barLabelWide} title={q.title}>
                  {q.title}
                </span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${q.rate * 100}%`,
                      background: GROUP_COLORS[i % GROUP_COLORS.length],
                    }}
                  />
                </div>
                <span className={styles.barValue}>
                  {Math.round(q.rate * 100)}%
                </span>
                <span className={styles.barSub}>
                  ({q.completed}/{q.enrolled})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
